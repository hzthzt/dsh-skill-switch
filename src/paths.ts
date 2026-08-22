import { homedir } from 'node:os'
import { join, resolve, win32 } from 'node:path'

export const DEFAULT_STORE_PATH = '~/.cc-switch/skills'
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Resolve the deliberately small configured-path grammar. */
export function resolveStorePath(input: string, home = homedir()): string {
  const value = input.trim()
  if (value === '~') return resolve(home)
  if (value.startsWith('~/') || value.startsWith('~\\')) return resolve(join(home, value.slice(2)))
  if (!win32.isAbsolute(value) || !/^[A-Za-z]:[\\/]/.test(value)) {
    throw new TypeError('Store path must be a Windows absolute path or start with ~')
  }
  return win32.resolve(value)
}

/** Whether either path contains the other under Windows case-insensitive semantics. */
export function pathsOverlap(left: string, right: string): boolean {
  const a = win32.resolve(left).toLocaleLowerCase('en-US')
  const b = win32.resolve(right).toLocaleLowerCase('en-US')
  if (a === b) return true
  const fromA = win32.relative(a, b)
  const fromB = win32.relative(b, a)
  return isContainedRelative(fromA) || isContainedRelative(fromB)
}

function isContainedRelative(value: string): boolean {
  return value.length > 0 && value !== '..' && !value.startsWith(`..\\`) && !win32.isAbsolute(value)
}

export function assertSkillName(name: string): void {
  if (!SKILL_NAME_PATTERN.test(name)) throw new TypeError(`Invalid Skill name: ${name}`)
}
