import { ExternalSkillEntry, SkillStatus, SkillSwitchEntry, SkillSwitchSnapshot } from "./types.js";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { Context } from "@deepseek-ai/cordis";

//#region src/config.d.ts
interface SkillSwitchConfig {
  readonly version: 1;
  readonly storePath: string;
}
/** Resolve the plugin-owned configuration document under the DSH home. */
declare function resolveConfigPath(dshHome: string): string;
/**
 * Strict, versioned, atomically replaced configuration owned by this plugin.
 *
 * DSH 0.2.0-rc.2 replaced per-namespace settings registration with a
 * profile-entry-id form projection, so this plugin owns its own document
 * instead of depending on that seam. The file lives beside the ownership
 * manifest under `$DSH_HOME/skill-switch/`.
 */
declare class ConfigStore {
  readonly path: string;
  constructor(path: string);
  read(): Promise<SkillSwitchConfig>;
  write(config: SkillSwitchConfig): Promise<void>;
}
declare function validateConfig(value: unknown): SkillSwitchConfig;
//#endregion
//#region src/manifest.d.ts
interface LinkIdentity {
  readonly dev: string;
  readonly ino: string;
  readonly birthtimeMs: number;
}
interface ManifestRecord {
  readonly name: string;
  readonly sourcePath: string;
  readonly identity: LinkIdentity;
}
interface SkillSwitchManifest {
  readonly version: 1;
  readonly links: readonly ManifestRecord[];
}
declare class ManifestStore {
  readonly path: string;
  constructor(path: string);
  read(): Promise<SkillSwitchManifest>;
  write(manifest: SkillSwitchManifest): Promise<void>;
}
declare function validateManifest(value: unknown): SkillSwitchManifest;
//#endregion
//#region src/manager.d.ts
interface SkillSwitchManagerOptions {
  readonly dshHome: string;
  readonly getStorePath: () => Promise<string>;
  readonly setStorePath: (path: string) => Promise<void>;
  readonly platform?: NodeJS.Platform;
  readonly userHome?: string;
}
/** Owns filesystem discovery and mutation behind one operation queue. */
declare class SkillSwitchManager {
  private readonly options;
  readonly targetPath: string;
  readonly manifest: ManifestStore;
  private readonly platform;
  private readonly userHome;
  private tail;
  constructor(options: SkillSwitchManagerOptions);
  snapshot(): Promise<SkillSwitchSnapshot>;
  setEnabled(name: string, enabled: boolean): Promise<SkillSwitchSnapshot>;
  disableAll(): Promise<SkillSwitchSnapshot>;
  setStorePath(path: string): Promise<SkillSwitchSnapshot>;
  private enqueue;
  private scan;
  private enable;
  private disable;
  private reconcileManifest;
  private writeIfChanged;
  private removeOwned;
  private matchesRecord;
  private scanTargets;
  private toEntry;
  private assertSeparated;
  private assertSupported;
}
//#endregion
//#region src/paths.d.ts
declare const DEFAULT_STORE_PATH = "~/.cc-switch/skills";
/** Resolve the deliberately small configured-path grammar. */
declare function resolveStorePath(input: string, home?: string): string;
/** Whether either path contains the other under Windows case-insensitive semantics. */
declare function pathsOverlap(left: string, right: string): boolean;
//#endregion
//#region src/scanner.d.ts
interface ScannedSkill {
  readonly name: string;
  readonly sourcePath: string;
  readonly description: string;
  readonly valid: boolean;
  readonly diagnostic: string;
}
/** Scan only direct, physical child directories of the configured store. */
declare function scanStore(storePath: string): Promise<ScannedSkill[]>;
//#endregion
//#region src/index.d.ts
declare const name = "dsh-skill-switch";
/** Host Remote service and sole owner of Skill Junction mutations. */
declare class SkillSwitchService extends TypertRemoteService {
  private readonly config;
  private readonly manager;
  constructor(ctx: Context);
  /** Return a fresh filesystem snapshot. */
  snapshot(): Promise<SkillSwitchSnapshot>;
  /** Enable or disable one named Skill and return the resulting snapshot. */
  setEnabled(name: string, enabled: boolean): Promise<SkillSwitchSnapshot>;
  /** Disable every Junction still verified as owned by this plugin. */
  disableAll(): Promise<SkillSwitchSnapshot>;
  /** Persist and activate a new central Skill directory. */
  setStorePath(path: string): Promise<SkillSwitchSnapshot>;
}
//#endregion
export { ConfigStore, DEFAULT_STORE_PATH, type ExternalSkillEntry, ManifestStore, type SkillStatus, type SkillSwitchEntry, SkillSwitchManager, SkillSwitchService, SkillSwitchService as default, type SkillSwitchSnapshot, name, pathsOverlap, resolveConfigPath, resolveStorePath, scanStore, validateConfig, validateManifest };