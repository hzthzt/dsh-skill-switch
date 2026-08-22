import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { ManifestStore, validateManifest } from '../src/manifest.ts'
import { pathsOverlap, resolveStorePath } from '../src/paths.ts'
import { scanStore } from '../src/scanner.ts'
import { SkillSwitchManager } from '../src/manager.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporary(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-switch-'))
  roots.push(root)
  return root
}

describe('configured paths', () => {
  it('expands only tilde and Windows absolute paths', () => {
    const home = join(tmpdir(), 'test-home')
    expect(resolveStorePath('~/skills', home)).toBe(resolve(home, 'skills'))
    expect(resolveStorePath('D:\\shared\\skills', 'C:\\Users\\test')).toBe('D:\\shared\\skills')
    expect(() => resolveStorePath('%USERPROFILE%\\skills', 'C:\\Users\\test')).toThrow(/Windows absolute/)
    expect(() => resolveStorePath('relative\\skills', 'C:\\Users\\test')).toThrow(/Windows absolute/)
  })

  it('rejects containment in either direction case-insensitively', () => {
    expect(pathsOverlap('C:\\Users\\Test\\.dsh', 'c:\\users\\test\\.dsh\\skills')).toBe(true)
    expect(pathsOverlap('C:\\central\\skills', 'C:\\Users\\Test\\.dsh\\skills')).toBe(false)
  })
})

describe('central store scanner', () => {
  it('parses direct directory bundles and reports invalid entries', async () => {
    const root = await temporary()
    await mkdir(join(root, 'valid-skill'))
    await writeFile(join(root, 'valid-skill', 'SKILL.md'), '---\nname: valid-skill\ndescription: Useful locally\n---\nBody\n')
    await mkdir(join(root, 'Bad_Name'))
    await writeFile(join(root, 'Bad_Name', 'SKILL.md'), '---\nname: Bad_Name\ndescription: no\n---\n')
    await mkdir(join(root, 'wrong-name'))
    await writeFile(join(root, 'wrong-name', 'SKILL.md'), '---\nname: another\ndescription: no\n---\n')
    await writeFile(join(root, 'loose.md'), 'ignored')

    const result = await scanStore(root)
    expect(result.map(skill => [skill.name, skill.valid])).toEqual([
      ['Bad_Name', false], ['valid-skill', true], ['wrong-name', false],
    ])
    expect(result[1]?.description).toBe('Useful locally')
  })

  it('does not follow linked source directories or linked SKILL.md files', async () => {
    const root = await temporary()
    const outside = await temporary()
    await mkdir(join(outside, 'linked'))
    await writeFile(join(outside, 'linked', 'SKILL.md'), '---\nname: linked\ndescription: linked\n---\n')
    const { symlink } = await import('node:fs/promises')
    await symlink(join(outside, 'linked'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(await scanStore(root)).toEqual([])
  })
})

describe('manifest store', () => {
  it('validates a strict, versioned ownership shape and writes JSON atomically', async () => {
    const root = await temporary()
    const store = new ManifestStore(join(root, 'state', 'manifest.json'))
    const manifest = { version: 1 as const, links: [{
      name: 'alpha-skill', sourcePath: 'C:\\store\\alpha-skill',
      identity: { dev: '1', ino: '2', birthtimeMs: 3 },
    }] }
    await store.write(manifest)
    expect(await store.read()).toEqual(manifest)
    expect(JSON.parse(await readFile(store.path, 'utf8'))).toEqual(manifest)
    expect(() => validateManifest({ ...manifest, extra: true })).toThrow(/fields/)
    expect(() => validateManifest({ version: 2, links: [] })).toThrow(/Invalid/)
    expect(() => validateManifest({ version: 1, links: [...manifest.links, ...manifest.links] })).toThrow(/Duplicate/)
  })
})

describe('unsupported platform', () => {
  it('returns an explicit status without creating target or manifest paths', async () => {
    const root = await temporary()
    const manager = new SkillSwitchManager({
      dshHome: join(root, 'dsh'), userHome: root, platform: 'linux',
      getStorePath: () => '~/store', setStorePath: async () => undefined,
    })
    const snapshot = await manager.snapshot()
    expect(snapshot.platform).toBe('unsupported-platform')
    expect(snapshot.skills).toEqual([])
    await expect(manager.setEnabled('alpha', true)).rejects.toThrow(/unsupported-platform/)
    await expect(readFile(manager.manifest.path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
