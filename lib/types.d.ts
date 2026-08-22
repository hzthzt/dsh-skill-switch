//#region src/types.d.ts
/** State of one central Skill as observed by the switcher. */
type SkillStatus = 'available' | 'enabled' | 'conflict' | 'invalid' | 'broken';
/** One central Skill row, including enough detail to explain and safely render its state. */
interface SkillSwitchEntry {
  readonly name: string;
  readonly description: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly status: SkillStatus;
  readonly managed: boolean;
  readonly diagnostic: string;
}
/** An entry already present in the DSH Skill target and not owned by this plugin. */
interface ExternalSkillEntry {
  readonly name: string;
  readonly targetPath: string;
  readonly kind: 'directory' | 'file' | 'link' | 'other';
  readonly diagnostic: string;
}
/** Point-in-time projection returned to the Web client. */
interface SkillSwitchSnapshot {
  readonly platform: 'supported' | 'unsupported-platform';
  readonly platformDiagnostic: string;
  readonly storePath: string;
  readonly targetPath: string;
  readonly managedEnabledCount: number;
  readonly skills: readonly SkillSwitchEntry[];
  readonly externalTargets: readonly ExternalSkillEntry[];
}
//#endregion
export { ExternalSkillEntry, SkillStatus, SkillSwitchEntry, SkillSwitchSnapshot };