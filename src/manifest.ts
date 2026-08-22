import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertSkillName } from './paths.ts'

export interface LinkIdentity {
  readonly dev: string
  readonly ino: string
  readonly birthtimeMs: number
}

export interface ManifestRecord {
  readonly name: string
  readonly sourcePath: string
  readonly identity: LinkIdentity
}

export interface SkillSwitchManifest {
  readonly version: 1
  readonly links: readonly ManifestRecord[]
}

const EMPTY_MANIFEST: SkillSwitchManifest = { version: 1, links: [] }

export class ManifestStore {
  constructor(readonly path: string) {}

  async read(): Promise<SkillSwitchManifest> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_MANIFEST
      throw error
    }
    return validateManifest(JSON.parse(text) as unknown)
  }

  async write(manifest: SkillSwitchManifest): Promise<void> {
    const value = validateManifest(manifest)
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await rename(temporary, this.path)
    } finally {
      await rm(temporary, { force: true })
    }
  }
}

export function validateManifest(value: unknown): SkillSwitchManifest {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.links)) {
    throw new TypeError('Invalid skill-switch manifest')
  }
  if (Object.keys(value).some(key => key !== 'version' && key !== 'links')) {
    throw new TypeError('Invalid skill-switch manifest fields')
  }
  const names = new Set<string>()
  const links = value.links.map((entry): ManifestRecord => {
    if (!isRecord(entry) || Object.keys(entry).some(key => !['name', 'sourcePath', 'identity'].includes(key))) {
      throw new TypeError('Invalid skill-switch manifest record')
    }
    if (typeof entry.name !== 'string' || typeof entry.sourcePath !== 'string' || !isRecord(entry.identity)) {
      throw new TypeError('Invalid skill-switch manifest record values')
    }
    assertSkillName(entry.name)
    if (names.has(entry.name)) throw new TypeError(`Duplicate manifest record: ${entry.name}`)
    names.add(entry.name)
    const identity = entry.identity
    if (Object.keys(identity).some(key => !['dev', 'ino', 'birthtimeMs'].includes(key))
      || typeof identity.dev !== 'string' || typeof identity.ino !== 'string'
      || typeof identity.birthtimeMs !== 'number' || !Number.isFinite(identity.birthtimeMs)) {
      throw new TypeError(`Invalid manifest identity: ${entry.name}`)
    }
    return { name: entry.name, sourcePath: entry.sourcePath, identity: {
      dev: identity.dev, ino: identity.ino, birthtimeMs: identity.birthtimeMs,
    } }
  })
  return { version: 1, links }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
