import { lstat, mkdir, opendir, readlink, rm, symlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { ManifestStore, type LinkIdentity, type ManifestRecord, type SkillSwitchManifest } from './manifest.ts'
import { assertSkillName, DEFAULT_STORE_PATH, pathsOverlap, resolveStorePath } from './paths.ts'
import { scanStore, type ScannedSkill } from './scanner.ts'
import type { ExternalSkillEntry, SkillSwitchEntry, SkillSwitchSnapshot } from './types.ts'

export interface SkillSwitchManagerOptions {
  readonly dshHome: string
  readonly getStorePath: () => Promise<string>
  readonly setStorePath: (path: string) => Promise<void>
  readonly platform?: NodeJS.Platform
  readonly userHome?: string
}

/** Owns filesystem discovery and mutation behind one operation queue. */
export class SkillSwitchManager {
  readonly targetPath: string
  readonly manifest: ManifestStore
  private readonly platform: NodeJS.Platform
  private readonly userHome: string
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly options: SkillSwitchManagerOptions) {
    this.platform = options.platform ?? process.platform
    this.userHome = options.userHome ?? homedir()
    this.targetPath = join(resolve(options.dshHome), 'skills')
    this.manifest = new ManifestStore(join(resolve(options.dshHome), 'skill-switch', 'manifest.json'))
  }

  snapshot(): Promise<SkillSwitchSnapshot> {
    return this.enqueue(() => this.scan())
  }

  setEnabled(name: string, enabled: boolean): Promise<SkillSwitchSnapshot> {
    return this.enqueue(async () => {
      this.assertSupported()
      assertSkillName(name)
      if (enabled) await this.enable(name)
      else await this.disable(name)
      return this.scan()
    })
  }

  disableAll(): Promise<SkillSwitchSnapshot> {
    return this.enqueue(async () => {
      this.assertSupported()
      const manifest = await this.manifest.read()
      let links = [...manifest.links]
      for (const record of manifest.links) {
        if (await this.removeOwned(record)) links = links.filter(link => link.name !== record.name)
      }
      await this.writeIfChanged(manifest, links)
      return this.scan()
    })
  }

  setStorePath(path: string): Promise<SkillSwitchSnapshot> {
    return this.enqueue(async () => {
      this.assertSupported()
      const next = resolveStorePath(path, this.userHome)
      this.assertSeparated(next)
      const manifest = await this.reconcileManifest(await this.manifest.read())
      if (manifest.links.length > 0) {
        throw new Error('Disable all managed Skills before changing the central directory.')
      }
      await this.options.setStorePath(path.trim())
      return this.scan()
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => undefined).then(operation)
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }

  private async scan(): Promise<SkillSwitchSnapshot> {
    const storePath = resolveStorePath(await this.options.getStorePath() || DEFAULT_STORE_PATH, this.userHome)
    if (this.platform !== 'win32') {
      return {
        platform: 'unsupported-platform',
        platformDiagnostic: 'dsh-skill-switch requires Windows Junction support.',
        storePath,
        targetPath: this.targetPath,
        managedEnabledCount: 0,
        skills: [],
        externalTargets: [],
      }
    }
    this.assertSeparated(storePath)
    const manifest = await this.reconcileManifest(await this.manifest.read())
    const owned = new Map(manifest.links.map(record => [record.name, record]))
    const targets = await this.scanTargets(owned)
    const externalNames = new Set(targets.map(entry => entry.name))
    const scanned = await scanStore(storePath)
    const matchedRecords = new Set<string>()
    const skills: SkillSwitchEntry[] = []
    for (const skill of scanned) {
      const record = owned.get(skill.name)
      if (record !== undefined && !samePath(record.sourcePath, skill.sourcePath)) continue
      if (record !== undefined) matchedRecords.add(record.name)
      skills.push(this.toEntry(skill, record, externalNames.has(skill.name)))
    }
    for (const record of manifest.links) {
      if (matchedRecords.has(record.name)) continue
      skills.push({
        name: record.name,
        description: '',
        sourcePath: record.sourcePath,
        targetPath: join(this.targetPath, record.name),
        status: 'broken',
        managed: true,
        diagnostic: 'The managed source is missing or no longer declares this Skill. Disable it before enabling another source.',
      })
    }
    skills.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.sourcePath.localeCompare(b.sourcePath, 'en'))
    return {
      platform: 'supported',
      platformDiagnostic: '',
      storePath,
      targetPath: this.targetPath,
      managedEnabledCount: manifest.links.length,
      skills,
      externalTargets: targets,
    }
  }

  private async enable(name: string): Promise<void> {
    const storePath = resolveStorePath(await this.options.getStorePath() || DEFAULT_STORE_PATH, this.userHome)
    this.assertSeparated(storePath)
    const candidates = (await scanStore(storePath)).filter(candidate => candidate.name === name)
    const skill = candidates.find(candidate => candidate.valid)
    if (skill === undefined) {
      if (candidates[0] !== undefined) throw new Error(candidates[0].diagnostic)
      throw new Error(`Skill not found: ${name}`)
    }
    const manifest = await this.reconcileManifest(await this.manifest.read())
    if (manifest.links.some(record => record.name === name)) return
    const target = join(this.targetPath, name)
    if (await exists(target)) throw new Error(`Target is externally managed: ${target}`)
    await mkdir(this.targetPath, { recursive: true })
    await symlink(skill.sourcePath, target, 'junction')
    let record: ManifestRecord | undefined
    try {
      const stat = await lstat(target, { bigint: true })
      if (!stat.isSymbolicLink() || !samePath(await readlink(target), skill.sourcePath)) {
        throw new Error(`Created target is not the expected Junction: ${target}`)
      }
      record = { name, sourcePath: resolve(skill.sourcePath), identity: identityOf(stat) }
      await this.manifest.write({ version: 1, links: [...manifest.links, record] })
    } catch (error) {
      if (record === undefined || await this.matchesRecord(record)) await rm(target, { force: true })
      throw error
    }
  }

  private async disable(name: string): Promise<void> {
    const manifest = await this.reconcileManifest(await this.manifest.read())
    const record = manifest.links.find(candidate => candidate.name === name)
    if (record === undefined) throw new Error(`Skill is not managed by this plugin: ${name}`)
    if (!await this.removeOwned(record)) {
      await this.manifest.write({ version: 1, links: manifest.links.filter(link => link.name !== name) })
      throw new Error(`Ownership was lost before disable: ${name}`)
    }
    await this.manifest.write({ version: 1, links: manifest.links.filter(link => link.name !== name) })
  }

  private async reconcileManifest(manifest: SkillSwitchManifest): Promise<SkillSwitchManifest> {
    const links: ManifestRecord[] = []
    for (const record of manifest.links) {
      const target = join(this.targetPath, record.name)
      if (!await exists(target)) continue
      if (await this.matchesRecord(record)) links.push(record)
    }
    await this.writeIfChanged(manifest, links)
    return links.length === manifest.links.length ? manifest : { version: 1, links }
  }

  private async writeIfChanged(before: SkillSwitchManifest, links: readonly ManifestRecord[]): Promise<void> {
    if (links.length === before.links.length && links.every((link, index) => link === before.links[index])) return
    await this.manifest.write({ version: 1, links })
  }

  private async removeOwned(record: ManifestRecord): Promise<boolean> {
    assertSkillName(record.name)
    const target = join(this.targetPath, record.name)
    if (!await this.matchesRecord(record)) return false
    await rm(target, { force: true })
    return true
  }

  private async matchesRecord(record: ManifestRecord): Promise<boolean> {
    const target = join(this.targetPath, record.name)
    try {
      const stat = await lstat(target, { bigint: true })
      return stat.isSymbolicLink()
        && sameIdentity(identityOf(stat), record.identity)
        && samePath(await readlink(target), record.sourcePath)
    } catch {
      return false
    }
  }

  private async scanTargets(owned: ReadonlyMap<string, ManifestRecord>): Promise<ExternalSkillEntry[]> {
    let directory
    try {
      directory = await opendir(this.targetPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const targets: ExternalSkillEntry[] = []
    for await (const entry of directory) {
      if (owned.has(entry.name)) continue
      targets.push({
        name: entry.name,
        targetPath: join(this.targetPath, entry.name),
        kind: entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        diagnostic: 'This target is externally managed and will not be changed.',
      })
    }
    return targets.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  }

  private toEntry(skill: ScannedSkill, record: ManifestRecord | undefined, conflict: boolean): SkillSwitchEntry {
    const targetPath = join(this.targetPath, skill.name)
    if (!skill.valid) return {
      name: skill.name, description: '', sourcePath: skill.sourcePath, targetPath,
      status: 'invalid', managed: record !== undefined, diagnostic: skill.diagnostic,
    }
    if (record !== undefined) return {
      name: skill.name, description: skill.description, sourcePath: skill.sourcePath, targetPath,
      status: 'enabled', managed: true, diagnostic: '',
    }
    if (conflict) return {
      name: skill.name, description: skill.description, sourcePath: skill.sourcePath, targetPath,
      status: 'conflict', managed: false,
      diagnostic: 'A file, directory, or unowned link already exists at the DSH target.',
    }
    return {
      name: skill.name, description: skill.description, sourcePath: skill.sourcePath, targetPath,
      status: 'available', managed: false, diagnostic: '',
    }
  }

  private assertSeparated(storePath: string): void {
    if (pathsOverlap(storePath, this.targetPath)) {
      throw new Error('The central directory and DSH skills directory must not contain one another.')
    }
  }

  private assertSupported(): void {
    if (this.platform !== 'win32') throw new Error('unsupported-platform: Windows Junctions are required.')
  }
}

function identityOf(stat: Awaited<ReturnType<typeof lstat>>): LinkIdentity {
  const value = stat as unknown as { dev: bigint | number; ino: bigint | number; birthtimeMs: bigint | number }
  return { dev: String(value.dev), ino: String(value.ino), birthtimeMs: Number(value.birthtimeMs) }
}

function sameIdentity(left: LinkIdentity, right: LinkIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right)
}

function normalizePath(value: string): string {
  return resolve(value.replace(/^\\\\\?\\/, '')).toLocaleLowerCase('en-US')
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
