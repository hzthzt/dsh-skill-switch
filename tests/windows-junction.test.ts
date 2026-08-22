import { lstat, mkdir, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillSwitchManager } from '../src/manager.ts'

const describeWindows = process.platform === 'win32' ? describe : describe.skip
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function setup(): Promise<{ root: string; store: string; dsh: string; manager: SkillSwitchManager; setting: { value: string } }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-switch-win-'))
  roots.push(root)
  const store = join(root, 'central')
  const dsh = join(root, 'dsh')
  await mkdir(store)
  const setting = { value: store }
  const manager = new SkillSwitchManager({
    dshHome: dsh, platform: 'win32', userHome: root,
    getStorePath: () => setting.value,
    setStorePath: async value => { setting.value = value },
  })
  return { root, store, dsh, manager, setting }
}

async function skill(store: string, name: string): Promise<void> {
  await mkdir(join(store, name))
  await writeFile(join(store, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} description\n---\nBody\n`)
}

describeWindows('real Junction lifecycle', () => {
  it('enables and disables without changing the source bundle', async () => {
    const { store, manager } = await setup()
    await skill(store, 'alpha-skill')
    const sourceBefore = await readFile(join(store, 'alpha-skill', 'SKILL.md'), 'utf8')
    const enabled = await manager.setEnabled('alpha-skill', true)
    const target = join(manager.targetPath, 'alpha-skill')
    expect(enabled.skills[0]?.status).toBe('enabled')
    expect((await lstat(target)).isSymbolicLink()).toBe(true)
    expect((await readlink(target)).toLocaleLowerCase()).toContain('alpha-skill')
    const disabled = await manager.setEnabled('alpha-skill', false)
    expect(disabled.skills[0]?.status).toBe('available')
    await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(store, 'alpha-skill', 'SKILL.md'), 'utf8')).toBe(sourceBefore)
  })

  it('reports conflicts and never adopts an ordinary target directory', async () => {
    const { store, manager } = await setup()
    await skill(store, 'nai-fadian')
    await mkdir(join(manager.targetPath, 'nai-fadian'), { recursive: true })
    const snapshot = await manager.snapshot()
    expect(snapshot.skills[0]?.status).toBe('conflict')
    expect(snapshot.externalTargets[0]?.name).toBe('nai-fadian')
    await expect(manager.setEnabled('nai-fadian', true)).rejects.toThrow(/externally managed/)
  })

  it('keeps a missing source as broken and allows safe disable', async () => {
    const { store, manager } = await setup()
    await skill(store, 'broken-skill')
    await manager.setEnabled('broken-skill', true)
    await rm(join(store, 'broken-skill'), { recursive: true })
    const snapshot = await manager.snapshot()
    expect(snapshot.skills[0]).toMatchObject({ name: 'broken-skill', status: 'broken', managed: true })
    const disabled = await manager.setEnabled('broken-skill', false)
    expect(disabled.managedEnabledCount).toBe(0)
  })

  it('abandons ownership when a target is externally replaced', async () => {
    const { store, manager } = await setup()
    await skill(store, 'drifted-skill')
    await manager.setEnabled('drifted-skill', true)
    const target = join(manager.targetPath, 'drifted-skill')
    await rm(target)
    await mkdir(target)
    const snapshot = await manager.snapshot()
    expect(snapshot.skills[0]?.status).toBe('conflict')
    expect(snapshot.managedEnabledCount).toBe(0)
    await expect(manager.setEnabled('drifted-skill', false)).rejects.toThrow(/not managed/)
    expect((await lstat(target)).isDirectory()).toBe(true)
  })

  it('serializes parallel toggles, disables all, and gates path changes', async () => {
    const { root, store, manager, setting } = await setup()
    await skill(store, 'alpha-skill')
    await skill(store, 'beta-skill')
    const [alpha, beta] = await Promise.all([
      manager.setEnabled('alpha-skill', true), manager.setEnabled('beta-skill', true),
    ])
    expect(alpha.managedEnabledCount).toBe(1)
    expect(beta.managedEnabledCount).toBe(2)
    await expect(manager.setStorePath(join(root, 'other-store'))).rejects.toThrow(/Disable all/)
    const cleared = await manager.disableAll()
    expect(cleared.managedEnabledCount).toBe(0)
    await mkdir(join(root, 'other-store'))
    await manager.setStorePath(join(root, 'other-store'))
    expect(setting.value).toBe(join(root, 'other-store'))
  })
})
