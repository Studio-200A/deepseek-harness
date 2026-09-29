// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { LinuxCaption, linuxCaptionMounted } from '../src/client/LinuxCaption.tsx'

interface ControlsFixture {
  readonly calls: string[]
  readonly controls: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    maximized(): Promise<boolean>
    onMaximizedChanged(listener: (maximized: boolean) => void): () => void
  }
}

function captionFixture(initialMaximized = false): ControlsFixture {
  const calls: string[] = []
  const maximized = initialMaximized
  const listeners = new Set<(maximized: boolean) => void>()
  return {
    calls,
    controls: {
      minimize: () => { calls.push('minimize') },
      toggleMaximize: () => { calls.push('toggle-maximize') },
      close: () => { calls.push('close') },
      maximized: () => Promise.resolve(maximized),
      onMaximizedChanged: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
  }
}

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.linuxWindowControls
})

describe('LinuxCaption', () => {
  it('renders nothing without the shell marker or controls', () => {
    expect(linuxCaptionMounted()).toBe(false)
    const plain = render(<LinuxCaption t={key => key} />)
    expect(plain.container.firstElementChild).toBeNull()
    document.documentElement.dataset.linuxWindowControls = ''
    const marked = render(<LinuxCaption t={key => key} />)
    // The marker alone does not produce controls; only the desktop preload supplies them.
    expect(marked.container.firstElementChild).toBeNull()
  })

  it('routes the three buttons to the shell window controls', async () => {
    document.documentElement.dataset.linuxWindowControls = ''
    const { calls, controls } = captionFixture()
    ;(window as { dshDesktop?: unknown }).dshDesktop = { windowControls: controls }
    const mounted = render(<LinuxCaption t={key => key} />)
    const buttons = mounted.getAllByRole('button')
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['window.minimize', 'window.maximize', 'close'])
    buttons[0]!.click()
    buttons[1]!.click()
    buttons[2]!.click()
    expect(calls).toEqual(['minimize', 'toggle-maximize', 'close'])
    // A button double-click never reaches the row's toggle; only the surrounding drag row does.
    buttons[1]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    expect(calls).toEqual(['minimize', 'toggle-maximize', 'close'])
    mounted.unmount()
    delete (window as { dshDesktop?: unknown }).dshDesktop
  })

  it('subscribes to maximized transitions from the shell', async () => {
    document.documentElement.dataset.linuxWindowControls = ''
    let notify: ((maximized: boolean) => void) | undefined
    const { controls } = captionFixture(true)
    ;(window as { dshDesktop?: unknown }).dshDesktop = { windowControls: {
      ...controls,
      onMaximizedChanged: (listener: (maximized: boolean) => void) => { notify = listener; return () => { notify = undefined } },
    } }
    const mounted = render(<LinuxCaption t={key => key} />)
    await act(async () => { await Promise.resolve() })
    expect(markedButtons(mounted.container)[1]!.getAttribute('aria-label')).toBe('window.restore')
    act(() => { notify?.(false) })
    expect(markedButtons(mounted.container)[1]!.getAttribute('aria-label')).toBe('window.maximize')
    act(() => { notify?.(true) })
    expect(markedButtons(mounted.container)[1]!.getAttribute('aria-label')).toBe('window.restore')
    mounted.unmount()
    delete (window as { dshDesktop?: unknown }).dshDesktop
  })

  it('double-clicks on the drag row toggle maximization, button double-clicks do not', () => {
    document.documentElement.dataset.linuxWindowControls = ''
    const { calls, controls } = captionFixture()
    ;(window as { dshDesktop?: unknown }).dshDesktop = { windowControls: controls }
    const mounted = render(<LinuxCaption t={key => key} />)
    mounted.container.firstElementChild!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    expect(calls).toEqual(['toggle-maximize'])
    mounted.unmount()
    delete (window as { dshDesktop?: unknown }).dshDesktop
  })
})

function markedButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')]
}
