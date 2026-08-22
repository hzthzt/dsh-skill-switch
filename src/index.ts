import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SkillSwitchManager } from './manager.ts'
import { DEFAULT_STORE_PATH } from './paths.ts'
import type { SkillSwitchSnapshot } from './types.ts'

export const name = 'dsh-skill-switch'

export type * from './types.ts'
export { ManifestStore, validateManifest } from './manifest.ts'
export { SkillSwitchManager } from './manager.ts'
export { DEFAULT_STORE_PATH, pathsOverlap, resolveStorePath } from './paths.ts'
export { scanStore } from './scanner.ts'

export const SETTINGS_NAMESPACE = settingsNamespace('skill-switch')

interface SkillSwitchSettings {
  readonly storePath: string
}

const SettingsSchema = z.object({
  storePath: z.string().default(DEFAULT_STORE_PATH),
})

/** Host Remote service and sole owner of Skill Junction mutations. */
export class SkillSwitchService extends TypertRemoteService {
  static inject = ['settings']
  private readonly settings: SettingsScope<SkillSwitchSettings>
  private readonly manager: SkillSwitchManager

  constructor(ctx: Context) {
    super(ctx, 'skillSwitch')
    this.settings = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema)
    this.manager = new SkillSwitchManager({
      dshHome: dshHomePath(),
      getStorePath: () => this.settings.get().storePath,
      setStorePath: async storePath => this.settings.update({ storePath }),
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
