// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SkillSwitchSnapshot } from '../src/types.ts'
import { SkillSwitchSection, type SkillSwitchInjected, type SkillSwitchSectionProps } from '../src/client/SkillSwitchSection.tsx'
import { apply } from '../src/client/index.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const React = await import('react')
  const icon = () => React.createElement('span', { 'aria-hidden': true })
  return {
    Button: ({ icon: leading, children, ...props }: Record<string, unknown>) => React.createElement('button', props, leading as ReactNode, children as ReactNode),
    Input: ({ icon: leading, ...props }: Record<string, unknown>) => React.createElement(React.Fragment, null, leading as ReactNode, React.createElement('input', props)),
    Tooltip: ({ children }: { children: ReactNode }) => children,
    Modal: ({ open, title, children, footer }: Record<string, unknown>) => open
      ? React.createElement('div', { role: 'dialog' }, title as ReactNode, children as ReactNode, footer as ReactNode)
      : null,
    IconChevronDownOutline14: icon,
    IconRefreshOutline16: icon,
    IconSearchOutline16: icon,
  }
})

afterEach(cleanup)

const snapshot: SkillSwitchSnapshot = {
  platform: 'supported', platformDiagnostic: '', storePath: 'C:\\central', targetPath: 'C:\\dsh\\skills',
  managedEnabledCount: 1,
  skills: [
    { name: 'alpha-skill', description: 'Alpha', sourcePath: 'C:\\central\\alpha-skill', targetPath: 'C:\\dsh\\skills\\alpha-skill', status: 'available', managed: false, diagnostic: '' },
    { name: 'beta-skill', description: 'Beta', sourcePath: 'C:\\central\\beta-skill', targetPath: 'C:\\dsh\\skills\\beta-skill', status: 'enabled', managed: true, diagnostic: '' },
    { name: 'nai-fadian', description: 'Conflict', sourcePath: 'C:\\central\\nai-fadian', targetPath: 'C:\\dsh\\skills\\nai-fadian', status: 'conflict', managed: false, diagnostic: 'External target' },
  ],
  externalTargets: [{ name: 'nai-fadian', targetPath: 'C:\\dsh\\skills\\nai-fadian', kind: 'directory', diagnostic: 'External' }],
}

function translate(key: string, params?: Record<string, unknown>): string {
  return params === undefined ? key : `${key} ${Object.values(params).join(' ')}`
}

function renderSection(overrides: Partial<SkillSwitchInjected> = {}) {
  const injected: SkillSwitchInjected = {
    snapshot: vi.fn(async () => snapshot),
    setEnabled: vi.fn(async () => snapshot),
    disableAll: vi.fn(async () => ({ ...snapshot, managedEnabledCount: 0 })),
    setStorePath: vi.fn(async path => ({ ...snapshot, storePath: path })),
    ...overrides,
  }
  const props = { ...injected, t: translate, close: () => undefined } as unknown as SkillSwitchSectionProps
  render(<SkillSwitchSection {...props} />)
  return injected
}

describe('Skills settings section', () => {
  it('renders loading, ready rows, search and status filtering', async () => {
    renderSection()
    expect(screen.getByText('loading')).toBeTruthy()
    expect(await screen.findByText('alpha-skill')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'beta' } })
    expect(screen.queryByText('alpha-skill')).toBeNull()
    expect(screen.getByText('beta-skill')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'conflict' } })
    expect(screen.getByText('emptySearch')).toBeTruthy()
  })

  it('toggles a row and keeps conflicts disabled', async () => {
    const setEnabled = vi.fn(async () => snapshot)
    renderSection({ setEnabled })
    await screen.findByText('alpha-skill')
    const alpha = screen.getByLabelText('alpha-skill: available') as HTMLInputElement
    const conflict = screen.getByLabelText('nai-fadian: available') as HTMLInputElement
    expect(conflict.disabled).toBe(true)
    fireEvent.click(alpha)
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledWith('alpha-skill', true) })
  })

  it('saves a path and confirms disable all', async () => {
    const setStorePath = vi.fn(async path => ({ ...snapshot, storePath: path }))
    const disableAll = vi.fn(async () => ({ ...snapshot, managedEnabledCount: 0 }))
    renderSection({ setStorePath, disableAll })
    await screen.findByDisplayValue('C:\\central')
    fireEvent.change(screen.getByLabelText('storePath'), { target: { value: 'D:\\shared\\skills' } })
    fireEvent.click(screen.getByText('save'))
    await waitFor(() => { expect(setStorePath).toHaveBeenCalledWith('D:\\shared\\skills') })
    fireEvent.click(screen.getByText('disableAll'))
    expect(screen.getByText('disableAllTitle')).toBeTruthy()
    fireEvent.click(screen.getByText('confirmDisableAll'))
    await waitFor(() => { expect(disableAll).toHaveBeenCalledOnce() })
  })

  it('renders load errors and unsupported state', async () => {
    const errorProps = {
      snapshot: vi.fn(async () => { throw new Error('offline') }),
      setEnabled: vi.fn(), disableAll: vi.fn(), setStorePath: vi.fn(),
      t: translate, close: () => undefined,
    } as unknown as SkillSwitchSectionProps
    render(<SkillSwitchSection {...errorProps} />)
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    cleanup()
    renderSection({ snapshot: vi.fn(async (): Promise<SkillSwitchSnapshot> => ({ ...snapshot, platform: 'unsupported-platform' })) })
    expect(await screen.findByText('unsupported')).toBeTruthy()
  })
})

describe('browser plugin lifecycle', () => {
  it('mounts its generated Remote and registers localized Skills navigation', async () => {
    const disposeRemote = vi.fn(async () => undefined)
    const registered: Array<Record<string, unknown>> = []
    const dictionaries: Array<Record<string, unknown>> = []
    const effects: Array<() => void | Promise<void>> = []
    const mount = vi.fn(async () => disposeRemote)
    const skillSwitch = {
      snapshot: vi.fn(async () => ({ ok: true, value: snapshot } as const)),
      setEnabled: vi.fn(), disableAll: vi.fn(), setStorePath: vi.fn(),
    }
    const services = {
      locale: {
        register: vi.fn((namespace: string, values: Record<string, unknown>) => {
          dictionaries.push({ namespace, values })
          return () => undefined
        }),
        bind: vi.fn(() => translate),
      },
      slots: {
        inject: vi.fn((_name: string, factory: () => unknown) => factory()),
        register: vi.fn((options: Record<string, unknown>) => {
          registered.push(options)
          return () => undefined
        }),
      },
      effect: vi.fn((factory: () => void | (() => void | Promise<void>)) => {
        const dispose = factory()
        if (typeof dispose === 'function') effects.push(dispose)
      }),
    }
    const remoteCtx = { ...services, remote: { $mount: mount, skillSwitch } }
    const ctx = {
      ...services,
      remote: {
        $mount: mount,
        get skillSwitch(): never {
          throw new Error('cannot get property "remote.skillSwitch" without inject')
        },
      },
      inject: vi.fn(async (deps: string[], factory: (scope: typeof remoteCtx) => unknown) => {
        expect(deps).toEqual(['remote.skillSwitch'])
        return factory(remoteCtx)
      }),
    }
    const dispose = await apply(ctx as never)
    expect(ctx.remote.$mount).toHaveBeenCalledOnce()
    expect(ctx.inject).toHaveBeenCalledOnce()
    expect(registered[0]).toMatchObject({ name: 'settings.section', id: 'skills' })
    const injected = (registered[0]?.inject as () => SkillSwitchInjected)()
    await expect(injected.snapshot()).resolves.toBe(snapshot)
    expect(skillSwitch.snapshot).toHaveBeenCalledOnce()
    expect(dictionaries[0]?.namespace).toBe('settings.skillSwitch')
    expect(dictionaries[0]?.values).toHaveProperty('zh')
    expect(dictionaries[0]?.values).toHaveProperty('en')
    expect(document.head.querySelector('style[data-plugin="dsh-skill-switch"]')).toBeTruthy()
    for (const effect of effects.reverse()) await effect()
    await dispose()
    expect(disposeRemote).toHaveBeenCalledOnce()
    expect(document.head.querySelector('style[data-plugin="dsh-skill-switch"]')).toBeNull()
  })
})
