import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  Button, IconChevronDownOutline14, IconRefreshOutline16, IconSearchOutline16,
  Input, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillStatus, SkillSwitchSnapshot } from '../types.ts'
import type { SkillSwitchLocaleKey } from './locales.ts'

export interface SkillSwitchInjected {
  snapshot: () => Promise<SkillSwitchSnapshot>
  setEnabled: (name: string, enabled: boolean) => Promise<SkillSwitchSnapshot>
  disableAll: () => Promise<SkillSwitchSnapshot>
  setStorePath: (path: string) => Promise<SkillSwitchSnapshot>
}

export type SkillSwitchSectionProps = PropsRuntime<'settings.section'>
  & PropsLocale<'settings.skillSwitch'>
  & InjectFace<SkillSwitchInjected>

type ViewState = { status: 'loading' } | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: SkillSwitchSnapshot }

const statuses: readonly SkillStatus[] = ['available', 'enabled', 'conflict', 'invalid', 'broken']

export function SkillSwitchSection(props: SkillSwitchSectionProps): ReactNode {
  const { snapshot: load, setEnabled, disableAll, setStorePath, t } = props
  const detailsPrefix = useId()
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [path, setPath] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SkillStatus | 'all'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let current = true
    setState({ status: 'loading' })
    void load().then(
      value => {
        if (!current) return
        setState({ status: 'ready', snapshot: value })
        setPath(value.storePath)
      },
      error => { if (current) setState({ status: 'error', message: errorMessage(error) }) },
    )
    return () => { current = false }
  }, [load, request])

  const visible = useMemo(() => {
    if (state.status !== 'ready') return []
    const normalized = query.trim().toLocaleLowerCase()
    return state.snapshot.skills.filter(skill =>
      (filter === 'all' || skill.status === filter)
      && (normalized.length === 0 || `${skill.name}\n${skill.description}`.toLocaleLowerCase().includes(normalized)))
  }, [filter, query, state])

  const run = async (key: string, operation: () => Promise<SkillSwitchSnapshot>): Promise<void> => {
    setPending(key)
    setActionError('')
    try {
      const value = await operation()
      setState({ status: 'ready', snapshot: value })
      setPath(value.storePath)
    } catch (error) {
      setActionError(t('actionError', { message: errorMessage(error) }))
    } finally {
      setPending(null)
    }
  }

  const ready = state.status === 'ready' ? state.snapshot : undefined
  const unsupported = ready?.platform === 'unsupported-platform'
  return (
    <section className="dss-root" aria-busy={state.status === 'loading' || pending !== null}>
      <header className="dss-header">
        <h2>{t('title')}</h2>
        <div className="dss-header-actions">
          {ready !== undefined && ready.managedEnabledCount > 0 ? (
            <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => { setConfirming(true) }}>
              {t('disableAll')}
            </Button>
          ) : null}
          <Tooltip label={t('refresh')} side="bottom">
            <button className="dss-icon-button" type="button" aria-label={t('refresh')} disabled={pending !== null}
              onClick={() => { setRequest(value => value + 1) }}>
              <IconRefreshOutline16 className={state.status === 'loading' ? 'dss-spin' : undefined} />
            </button>
          </Tooltip>
        </div>
      </header>

      {state.status === 'loading' ? <p className="dss-status">{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className="dss-error" role="alert"><span>{t('loadError')} {state.message}</span>
          <Button size="sm" variant="outline" onClick={() => { setRequest(value => value + 1) }}>{t('retry')}</Button>
        </div>
      ) : null}
      {ready !== undefined ? (
        <>
          {unsupported ? <p className="dss-banner" role="status">{t('unsupported')}</p> : null}
          <div className="dss-path-block">
            <div className="dss-label-row"><label htmlFor={`${detailsPrefix}-path`}>{t('storePath')}</label>
              <span className="dss-target" title={ready.targetPath}>{t('targetPath')}: {ready.targetPath}</span></div>
            <div className="dss-path-row">
              <Input id={`${detailsPrefix}-path`} className="dss-path-input" value={path} disabled={unsupported || pending !== null}
                onChange={event => { setPath(event.currentTarget.value) }} />
              <Button variant="primary" disabled={unsupported || pending !== null || path.trim().length === 0 || path === ready.storePath}
                onClick={() => { void run('path', () => setStorePath(path)) }}>{t('save')}</Button>
            </div>
          </div>
          <div className="dss-toolbar">
            <Input className="dss-search" type="search" icon={<IconSearchOutline16 />} value={query}
              placeholder={t('search')} aria-label={t('search')} onChange={event => { setQuery(event.currentTarget.value) }} />
            <select className="dss-filter" value={filter} aria-label={t('filter')}
              onChange={event => { setFilter(event.currentTarget.value as SkillStatus | 'all') }}>
              <option value="all">{t('all')}</option>
              {statuses.map(status => <option key={status} value={status}>{t(status)}</option>)}
            </select>
          </div>
          <div className="dss-summary"><span className="dss-count">{t('managedCount', { count: ready.managedEnabledCount })}</span></div>
          {actionError.length > 0 ? <p className="dss-action-error" role="alert">{actionError}</p> : null}
          {ready.skills.length === 0 ? <p className="dss-status">{t('empty')}</p> : null}
          {ready.skills.length > 0 && visible.length === 0 ? <p className="dss-status">{t('emptySearch')}</p> : null}
          {visible.length > 0 ? (
            <ul className="dss-list">
              {visible.map(skill => {
                const open = expanded === skill.name
                const detailId = `${detailsPrefix}-${skill.name}`
                const canToggle = !unsupported && (skill.managed || (skill.status !== 'invalid' && skill.status !== 'conflict'))
                return <li className="dss-row" key={skill.name} data-status={skill.status}>
                  <div className="dss-row-main">
                    <div className="dss-copy"><div className="dss-name-line"><span className="dss-name">{skill.name}</span>
                      <span className="dss-badge" data-status={skill.status}>{t(skill.status)}</span></div>
                      <p className="dss-description">{skill.description || skill.diagnostic}</p></div>
                    <Tooltip label={t('details')} side="bottom"><button className="dss-disclosure" type="button" aria-label={`${t('details')}: ${skill.name}`}
                      aria-expanded={open} aria-controls={detailId} onClick={() => { setExpanded(value => value === skill.name ? null : skill.name) }}>
                      <IconChevronDownOutline14 /></button></Tooltip>
                    <label className="dss-toggle" title={t(skill.managed ? 'enabled' : 'available')}>
                      <input type="checkbox" checked={skill.managed} disabled={!canToggle || pending !== null}
                        aria-label={`${skill.name}: ${t(skill.managed ? 'enabled' : 'available')}`}
                        onChange={event => { const enabled = event.currentTarget.checked; void run(skill.name, () => setEnabled(skill.name, enabled)) }} />
                      <span className="dss-toggle-track" aria-hidden="true" />
                    </label>
                  </div>
                  {open ? <dl className="dss-details" id={detailId}>
                    <div><dt>{t('source')}</dt><dd>{skill.sourcePath}</dd></div>
                    <div><dt>{t('target')}</dt><dd>{skill.targetPath}</dd></div>
                    {skill.diagnostic ? <div><dt>{t('diagnostic')}</dt><dd className="dss-diagnostic">{skill.diagnostic}</dd></div> : null}
                  </dl> : null}
                </li>
              })}
            </ul>
          ) : null}
          {ready.externalTargets.length > 0 ? <details className="dss-external"><summary>{t('externalCount', { count: ready.externalTargets.length })}</summary>
            <ul>{ready.externalTargets.map(entry => <li key={entry.targetPath}><strong>{entry.name}</strong> · {t('external')}<br /><code>{entry.targetPath}</code></li>)}</ul>
          </details> : null}
        </>
      ) : null}
      <Modal open={confirming} onClose={() => { setConfirming(false) }} title={t('disableAllTitle')} closeLabel={t('close')}
        footer={<div className="dss-modal-actions"><Button variant="outline" onClick={() => { setConfirming(false) }}>{t('cancel')}</Button>
          <Button variant="primary" disabled={pending !== null} onClick={() => { setConfirming(false); void run('all', disableAll) }}>{t('confirmDisableAll')}</Button></div>}>
        <p className="dss-modal-copy">{t('disableAllDescription')}</p>
      </Modal>
    </section>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
