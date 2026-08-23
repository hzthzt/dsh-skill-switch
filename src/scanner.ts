import { lstat, opendir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { SKILL_NAME_PATTERN } from './paths.ts'

export interface ScannedSkill {
  readonly name: string
  readonly sourcePath: string
  readonly description: string
  readonly valid: boolean
  readonly diagnostic: string
}

/** Scan only direct, physical child directories of the configured store. */
export async function scanStore(storePath: string): Promise<ScannedSkill[]> {
  let directory
  try {
    directory = await opendir(storePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const skills: ScannedSkill[] = []
  for await (const entry of directory) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const sourcePath = join(storePath, entry.name)
    skills.push(await inspectSkill(entry.name, sourcePath))
  }
  const counts = new Map<string, number>()
  for (const skill of skills) {
    if (skill.valid) counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1)
  }
  return skills.map(skill => skill.valid && counts.get(skill.name)! > 1
    ? invalid(skill.name, skill.sourcePath, `Duplicate frontmatter name "${skill.name}" is declared by multiple source directories.`)
    : skill)
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.sourcePath.localeCompare(b.sourcePath, 'en'))
}

async function inspectSkill(directoryName: string, sourcePath: string): Promise<ScannedSkill> {
  const skillFile = join(sourcePath, 'SKILL.md')
  try {
    const stat = await lstat(skillFile)
    if (!stat.isFile() || stat.isSymbolicLink()) return invalid(directoryName, sourcePath, 'SKILL.md must be a regular file.')
    const text = await readFile(skillFile, 'utf8')
    const frontmatter = parseFrontmatter(text)
    if (!isRecord(frontmatter)) return invalid(directoryName, sourcePath, 'SKILL.md frontmatter must be a YAML mapping.')
    if (typeof frontmatter.name !== 'string') {
      return invalid(directoryName, sourcePath, 'Frontmatter name must be a string.')
    }
    const name = frontmatter.name
    if (!SKILL_NAME_PATTERN.test(name)) return invalid(name, sourcePath, 'Frontmatter name must be kebab-case.')
    if (typeof frontmatter.description !== 'string' || frontmatter.description.trim().length === 0) {
      return invalid(name, sourcePath, 'Frontmatter description must be a non-empty string.')
    }
    return { name, sourcePath, description: frontmatter.description.trim(), valid: true, diagnostic: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return invalid(directoryName, sourcePath, `Invalid SKILL.md: ${message}`)
  }
}

function parseFrontmatter(text: string): unknown {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) throw new TypeError('missing YAML frontmatter')
  const end = normalized.indexOf('\n---', 4)
  if (end < 0) throw new TypeError('unterminated YAML frontmatter')
  const suffix = normalized.slice(end + 4, end + 5)
  if (suffix !== '' && suffix !== '\n') throw new TypeError('frontmatter delimiter must be on its own line')
  return parse(normalized.slice(4, end), { uniqueKeys: true })
}

function invalid(name: string, sourcePath: string, diagnostic: string): ScannedSkill {
  return { name, sourcePath, description: '', valid: false, diagnostic }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
