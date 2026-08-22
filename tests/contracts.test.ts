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

  it('keeps bundle and Client declarations separate', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.profile).toBeUndefined()
    expect(manifest.exports['./typert']).toBeTruthy()
    expect(manifest.exports['./remote']).toBeTruthy()
    expect(manifest.files).toContain('lib/client.js')
  })
})
