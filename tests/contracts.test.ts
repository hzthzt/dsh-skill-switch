import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('generated and packaged contracts', () => {
  it('loads the built Host entry after decorator lowering', async () => {
    const module = await import('../lib/index.js')
    expect(module.SkillSwitchService).toBeTypeOf('function')
  })

  it('contains all generated strict Remote endpoints', async () => {
    const generated = await readFile(new URL('../lib/typert.remote-client.js', import.meta.url), 'utf8')
    for (const method of ['snapshot', 'setEnabled', 'disableAll', 'setStorePath']) {
      expect(generated).toContain(`skillSwitch/${method}`)
    }
    expect(generated.match(/mode: 'strict'/g)?.length).toBeGreaterThanOrEqual(7)
  })

  /**
   * DSH 0.2.0-rc.2 replaced the `{ mode, typeSymbol, schema }` codec with a
   * success-cached `create()` factory; the registry, loader and Gateway all
   * reject a descriptor without it.
   */
  it('emits the 0.2.0-rc.2 strict-codec contract on both Typert faces', async () => {
    for (const artifact of ['../lib/typert.host.js', '../lib/typert.remote-client.js']) {
      const generated = await readFile(new URL(artifact, import.meta.url), 'utf8')
      // Four result codecs plus three parameter codecs, each a `create()` factory.
      expect(generated.match(/create: \w+\$schema,/g)?.length).toBe(7)
      expect(generated).not.toMatch(/\bschema: /)
    }
    const host = await readFile(new URL('../lib/typert.host.js', import.meta.url), 'utf8')
    expect(host).toContain("package: 'dsh-skill-switch'")
    expect(host).toContain("face: 'host'")
    expect(host).toContain('model: {')
  })

  it('keeps bundle and Client declarations separate', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.profile).toBeUndefined()
    expect(manifest.exports['./typert']).toBeTruthy()
    expect(manifest.exports['./remote']).toBeTruthy()
    expect(manifest.files).toContain('lib/client.js')
  })

  /**
   * The runtime compatibility gate skips any bundle whose `@deepseek-ai/dsh*`
   * peers do not satisfy the running dsh version, so a stale pin fails silently.
   */
  it('pins every dsh peer to the baseline runtime version', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const baseline = /Package version: `([^`]+)`/.exec(
      await readFile(new URL('../HARNESS_BASELINE.md', import.meta.url), 'utf8'),
    )?.[1]
    expect(baseline).toBeTruthy()
    const peers = Object.entries(manifest.peerDependencies as Record<string, string>)
      .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    expect(peers.length).toBeGreaterThan(0)
    for (const [name, range] of peers) expect([name, range]).toEqual([name, baseline])
    expect(manifest.devDependencies['@deepseek-ai/dsh-client-runtime']).toBeUndefined()
  })
})
