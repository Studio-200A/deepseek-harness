/**
 * Linux self-drawn window caption. The Electron shell's preload marks the document root
 * (`data-linux-window-controls`) when it owns a frameless window; this component renders
 * the drag row with the minimize, maximize/restore, and close buttons, following the
 * caption geometry the Windows layout already publishes on the root.
 *
 * Web and other desktop platforms never set the marker, so nothing renders there.
 */
import { useEffect, useState } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { CommonKey } from '@deepseek-ai/dsh-client-locale/client'
import css from './LinuxCaption.module.css'

/** Linux window-control bridge exposed by the desktop preload. */
interface WindowControls {
  minimize(): void
  toggleMaximize(): void
  close(): void
  maximized(): Promise<boolean>
  onMaximizedChanged(listener: (maximized: boolean) => void): () => void
}

/** Props for the Linux self-drawn caption. */
export type LinuxCaptionProps = {
  /** Common-namespace translations for the button labels. */
  t: Translate<CommonKey>
}

/**
 * Whether the document runs in a Linux desktop shell that owns self-drawn window controls.
 * @returns True when the preload published the Linux caption marker.
 */
export function linuxCaptionMounted(): boolean {
  return document.documentElement.hasAttribute('data-linux-window-controls')
}

/** The self-drawn caption row; renders nothing outside a Linux desktop shell. */
export function LinuxCaption({ t }: LinuxCaptionProps) {
  const [maximized, setMaximized] = useState(false)
  const [controls] = useState<WindowControls | undefined>(() => (window as {
    dshDesktop?: { windowControls?: WindowControls }
  }).dshDesktop?.windowControls)

  useEffect(() => {
    if (controls === undefined) return
    void controls.maximized().then(setMaximized)
    return controls.onMaximizedChanged(setMaximized)
  }, [controls])

  if (controls === undefined) return null
  const toggle = (event: React.MouseEvent<HTMLDivElement>): void => {
    // A double-click on the drag row (never on a button) toggles maximization, like a native titlebar.
    if (!(event.target instanceof Element) || event.target.closest('button') === null) controls.toggleMaximize()
  }

  return (
    <div className={css.caption} onDoubleClick={toggle}>
      <div className={css.controls}>
        <button type="button" className={css.button} aria-label={t('window.minimize')} title={t('window.minimize')}
          onClick={() => { controls.minimize() }}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 8.5h10" /></svg>
        </button>
        <button type="button" className={css.button} aria-label={maximized ? t('window.restore') : t('window.maximize')}
          title={maximized ? t('window.restore') : t('window.maximize')}
          onClick={() => { controls.toggleMaximize() }}>
          {maximized
            ? <svg viewBox="0 0 12 12" className={css.icon} aria-hidden="true"><path d="M3.5 3.5V1.5h7v7h-2M1.5 3.5h7v7h-7z" /></svg>
            : <svg viewBox="0 0 12 12" className={css.icon} aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" /></svg>}
        </button>
        <button type="button" className={`${css.button} ${css.close}`} aria-label={t('close')} title={t('close')}
          onClick={() => { controls.close() }}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 2 8 8M10 2 2 10" /></svg>
        </button>
      </div>
    </div>
  )
}
