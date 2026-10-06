/**
 * Presentation options – how the editor UI is shown.
 *
 * The same page (`src/sidepanel/index.html`) can be hosted in several surfaces:
 * - the docked **side panel** (default; persistent, user-resizable);
 * - a detached **window** (floating, freely resizable, with a sensible default
 *   size we control);
 * - a full **browser tab** (maximum space).
 *
 * This module opens the window/tab surfaces. Neither needs extra permissions:
 * an extension may open its own pages in a tab or popup window. See
 * `docs/presentation-options.md` for the full report on what is and isn't
 * customisable.
 */

import { rememberPopoutBounds } from '../popout-bounds';
import { createEditorTab, createPopoutWindow } from '../surface';

/**
 * Whether *this* document is genuinely the docked side panel, as opposed to
 * an already-detached window or tab that happens to be running the same
 * page. Two independent signals distinguish it:
 * - `chrome.tabs.getCurrent()` resolves to `undefined` for anything that
 *   isn't a tab – true for the side panel, but also true for a detached popup
 *   window (see {@link openInWindow}).
 * - `chrome.windows.getCurrent()` reports `type: 'normal'` for the side
 *   panel (it lives inside an ordinary browser window) but `type: 'popup'`
 *   for a window opened via {@link openInWindow} – so combining both signals
 *   tells the docked panel apart from either surface it can open.
 *
 * Used to decide whether to self-close after successfully opening the editor
 * elsewhere, so the docked panel gets out of the way once the user has moved
 * to a bigger surface. Resolves `false` (never self-close)
 * wherever the APIs are unavailable, e.g. the unit-test harness.
 */
async function isDockedSidePanel(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.getCurrent || !chrome.windows?.getCurrent) {
    return false;
  }
  try {
    const [tab, win] = await Promise.all([chrome.tabs.getCurrent(), chrome.windows.getCurrent()]);
    return tab === undefined && win?.type === 'normal';
  } catch {
    return false;
  }
}

/**
 * Close the hosting side-panel document – but only when it really is the
 * docked side panel (see {@link isDockedSidePanel}) – so the panel gets out
 * of the way now a bigger surface exists. Never closes a detached window or
 * tab that opened another surface from itself.
 */
async function closeIfDockedSidePanel(): Promise<void> {
  if (await isDockedSidePanel()) {
    window.close();
  }
}

/**
 * Open the editor in a detached, resizable popup window, at the size and
 * place the user last left it (see popout-bounds.ts).
 */
export function openInWindow(): void {
  if (typeof chrome === 'undefined' || !chrome.windows?.create) return;
  createPopoutWindow()
    .then(() => closeIfDockedSidePanel())
    .catch((error: unknown) => {
      console.error('Failed to open the editor in a new window:', error);
    });
}

/** Open the editor in a full browser tab. */
export function openInTab(): void {
  if (typeof chrome === 'undefined' || !chrome.tabs?.create) return;
  createEditorTab()
    .then(() => closeIfDockedSidePanel())
    .catch((error: unknown) => {
      console.error('Failed to open the editor in a new tab:', error);
    });
}

/**
 * When this document is the detached popup window, keep its size and
 * position for the next time it opens. Does nothing in the docked panel or a
 * tab, whose geometry is not ours to remember.
 */
export async function rememberWindowBoundsIfPopout(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.getCurrent || !chrome.windows?.getCurrent) {
    return;
  }
  try {
    const [tab, win] = await Promise.all([chrome.tabs.getCurrent(), chrome.windows.getCurrent()]);
    if (tab === undefined && win?.type === 'popup' && win.id !== undefined) {
      rememberPopoutBounds(win.id);
    }
  } catch {
    // Without the window there is nothing to remember.
  }
}
