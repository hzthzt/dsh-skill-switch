import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ConfigStore, resolveConfigPath } from './config.ts'
import { SkillSwitchManager } from './manager.ts'
import { DEFAULT_STORE_PATH } from './paths.ts'
import type { SkillSwitchSnapshot } from './types.ts'

export const name = 'dsh-skill-switch'

export type * from './types.ts'
export { ConfigStore, resolveConfigPath, validateConfig } from './config.ts'
export { ManifestStore, validateManifest } from './manifest.ts'
export { SkillSwitchManager } from './manager.ts'
export { DEFAULT_STORE_PATH, pathsOverlap, resolveStorePath } from './paths.ts'
export { scanStore } from './scanner.ts'

/** Host Remote service and sole owner of Skill Junction mutations. */
export class SkillSwitchService extends TypertRemoteService {
  private readonly config: ConfigStore
  private readonly manager: SkillSwitchManager

  constructor(ctx: Context) {
    super(ctx, 'skillSwitch')
    this.config = new ConfigStore(resolveConfigPath(dshHomePath()))
    this.manager = new SkillSwitchManager({
      dshHome: dshHomePath(),
      getStorePath: async () => (await this.config.read()).storePath,
      setStorePath: async storePath => { await this.config.write({ version: 1, storePath }) },
    })
  }

  /** Return a fresh filesystem snapshot. */
  @Remote
  snapshot(): Promise<SkillSwitchSnapshot> {
    return this.manager.snapshot()
  }

  /** Enable or disable one named Skill and return the resulting snapshot. */
  @Remote
  setEnabled(name: string, enabled: boolean): Promise<SkillSwitchSnapshot> {
    return this.manager.setEnabled(name, enabled)
  }

  /** Disable every Junction still verified as owned by this plugin. */
  @Remote
  disableAll(): Promise<SkillSwitchSnapshot> {
    return this.manager.disableAll()
  }

  /** Persist and activate a new central Skill directory. */
  @Remote
  setStorePath(path: string): Promise<SkillSwitchSnapshot> {
    return this.manager.setStorePath(path)
  }
}

export default SkillSwitchService
