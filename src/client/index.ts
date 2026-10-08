import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import remoteContribution from '../../lib/typert.remote-client.js'
import { SkillSwitchSection, type SkillSwitchInjected } from './SkillSwitchSection.tsx'
import { en, zh, type SkillSwitchLocaleKey } from './locales.ts'
import { styles } from './styles.ts'

export type { SkillSwitchInjected, SkillSwitchSectionProps } from './SkillSwitchSection.tsx'
export type { SkillSwitchLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.skillSwitch': SkillSwitchLocaleKey
  }
}

export const NS = 'settings.skillSwitch'
export const inject = ['slots', 'locale', 'remote']

/** Mount this package's Remote contribution and independent Settings page. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remoteContribution)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-skill-switch: dictionaries')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-skill-switch'
    tag.textContent = styles
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'dsh-skill-switch: styles')

  const unwrap = async <T>(result: Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }>): Promise<T> => {
    const value = await result
    if (!value.ok) throw new Error(`${value.error.code}: ${value.error.message}`)
    return value.value
  }
  await ctx.inject(['remote.skillSwitch'], (remoteCtx) => {
    const injected = (): SkillSwitchInjected => ({
      snapshot: () => unwrap(remoteCtx.remote.skillSwitch.snapshot()),
      setEnabled: (name, enabled) => unwrap(remoteCtx.remote.skillSwitch.setEnabled(name, enabled)),
      disableAll: () => unwrap(remoteCtx.remote.skillSwitch.disableAll()),
      setStorePath: path => unwrap(remoteCtx.remote.skillSwitch.setStorePath(path)),
    })
    const t = remoteCtx.locale.bind(NS)
    remoteCtx.slots.inject('settings.section', () => remoteCtx.slots.register({
      name: 'settings.section', id: 'skills', order: 35, label: () => t('nav'), locale: NS, inject: injected,
    }, SkillSwitchSection))
  })

  return disposeRemote
}
