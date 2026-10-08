import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_STORE_PATH } from './paths.ts'

export interface SkillSwitchConfig {
  readonly version: 1
  readonly storePath: string
}

/** Resolve the plugin-owned configuration document under the DSH home. */
export function resolveConfigPath(dshHome: string): string {
  return join(dshHome, 'skill-switch', 'config.json')
}

/**
 * Strict, versioned, atomically replaced configuration owned by this plugin.
 *
 * DSH 0.2.0-rc.2 replaced per-namespace settings registration with a
 * profile-entry-id form projection, so this plugin owns its own document
 * instead of depending on that seam. The file lives beside the ownership
 * manifest under `$DSH_HOME/skill-switch/`.
 */
export class ConfigStore {
  constructor(readonly path: string) {}

  async read(): Promise<SkillSwitchConfig> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyConfig()
      throw error
    }
    return validateConfig(JSON.parse(text) as unknown)
  }

  async write(config: SkillSwitchConfig): Promise<void> {
    const value = validateConfig(config)
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

function emptyConfig(): SkillSwitchConfig {
  return { version: 1, storePath: DEFAULT_STORE_PATH }
}

export function validateConfig(value: unknown): SkillSwitchConfig {
  if (!isRecord(value) || value.version !== 1 || typeof value.storePath !== 'string') {
    throw new TypeError('Invalid skill-switch configuration')
  }
  if (Object.keys(value).some(key => key !== 'version' && key !== 'storePath')) {
    throw new TypeError('Invalid skill-switch configuration fields')
  }
  if (value.storePath.trim().length === 0) {
    throw new TypeError('Invalid skill-switch configuration storePath')
  }
  return { version: 1, storePath: value.storePath }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
