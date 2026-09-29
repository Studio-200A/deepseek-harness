/** Linux self-drawn caption markers consumed by the shared Web layout. */

import { WINDOWS_TITLEBAR_HEIGHT } from './windows-layout.ts'

/**
 * Mark the document root so the shared Web client reserves the caption row and renders
 * its own window controls. Reuses the Windows caption layout marker (same geometry and
 * drag clearance) plus a Linux-only marker selecting the self-drawn control buttons.
 * @returns Nothing; the markers land immediately or at DOMContentLoaded.
 */
export function syncLinuxCaption(): void {
  if (process.platform !== 'linux') return
  const mark = (): void => {
    const root = document.documentElement
    root.dataset.windowsTitlebar = ''
    root.dataset.linuxWindowControls = ''
    root.style.setProperty('--dsh-windows-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  }
  // The root can be absent before the HTML parser creates it.
  if ((document.documentElement as HTMLElement | null) !== null) mark()
  else window.addEventListener('DOMContentLoaded', mark)
}
