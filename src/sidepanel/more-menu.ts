/**
 * The More ▾ menu – the less frequent, whole-panel actions – and the keyboard
 * route to Settings.
 *
 * Open in a new window / tab move the editor to a resizable surface (the
 * docked panel cannot be widened); the ways of putting something into the
 * field other than typing it (Search symbols, Drawing, My library, Custom
 * shortcuts) sit next, so they are two Shift+Tabs from the field whatever
 * the search row shows; the remaining items open the Equation source disclosure or a
 * workspace mode (Keyboard shortcuts, Settings), whose Close returns focus
 * to this menu. The Equation source item is only offered while that
 * disclosure is part of the interface – a menu item that revealed nothing
 * would be a dead end.
 *
 * This menu is itself switchable off, which is why the Settings shortcut
 * lives here beside it: with the menu gone, that shortcut is the way into
 * Settings, and therefore the way back to every other toggle.
 */
import { announce } from './a11y';
import { createMenu } from './menu';
import type { MenuController } from './menu';
import { openInTab, openInWindow } from './presentation';
import { isPartShown } from './part-visibility';
import {
  SEARCH_SHORTCUT_KEYS,
  SEARCH_SHORTCUT_LABEL,
  SETTINGS_SHORTCUT_KEYS,
  SETTINGS_SHORTCUT_LABEL,
} from './shortcut-labels';
import type { Workspace } from './workspace';

/**
 * Open the collapsed Equation source disclosure and move focus to it. It is
 * looked up at activation time because it is built a frame after this menu
 * (see boot in main.ts). Opening through the `open` property fires the same
 * `toggle` event as a click, so the view persists the state exactly as it
 * would for a pointer user.
 */
function revealDisclosure(selector: string): void {
  const details = document.querySelector<HTMLDetailsElement>(selector);
  if (!details) return;
  details.open = true;
  const target = details.querySelector<HTMLElement>('summary') ?? details;
  target.scrollIntoView({ block: 'nearest' });
  target.focus();
}

export interface MoreMenuHooks {
  /** Open the quick search under the equation field. */
  searchSymbols: () => void;
}

export function createMoreMenu(
  getWorkspace: () => Workspace | undefined,
  hooks: MoreMenuHooks,
): MenuController {
  const menu = createMenu({
    id: 'more',
    label: 'More',
    align: 'end',
    entries: [
      {
        label: 'Open in a new window',
        onSelect: () => {
          announce('Opening the editor in a new window');
          openInWindow();
        },
      },
      {
        label: 'Open in a new tab',
        onSelect: () => {
          announce('Opening the editor in a new tab');
          openInTab();
        },
      },
      { kind: 'separator' },
      {
        label: 'Search symbols',
        detail: 'By name or description',
        shortcut: SEARCH_SHORTCUT_LABEL,
        keyshortcuts: SEARCH_SHORTCUT_KEYS,
        focusAfter: 'none',
        onSelect: hooks.searchSymbols,
      },
      {
        label: 'Drawing',
        detail: 'Sketch a symbol',
        focusAfter: 'none',
        onSelect: () => getWorkspace()?.open('drawing', menu.trigger),
      },
      {
        label: 'My library',
        detail: 'Whole saved equations',
        focusAfter: 'none',
        onSelect: () => getWorkspace()?.open('library', menu.trigger),
      },
      {
        label: 'Custom shortcuts',
        detail: 'Your own \\ triggers',
        focusAfter: 'none',
        onSelect: () => getWorkspace()?.open('customShortcuts', menu.trigger),
      },
      { kind: 'separator' },
      {
        label: 'Equation source',
        focusAfter: 'none',
        shown: () => isPartShown('source'),
        onSelect: () => revealDisclosure('details.source'),
      },
      {
        label: 'Keyboard shortcuts',
        focusAfter: 'none',
        onSelect: () => getWorkspace()?.open('shortcuts', menu.trigger),
      },
      {
        label: 'Settings',
        focusAfter: 'none',
        shortcut: SETTINGS_SHORTCUT_LABEL,
        keyshortcuts: SETTINGS_SHORTCUT_KEYS,
        onSelect: () => getWorkspace()?.open('settings', menu.trigger),
      },
    ],
  });
  return menu;
}

/**
 * Install the panel-wide "open Settings" shortcut (Alt+,). Matched on the
 * physical key (`code`), not the produced character, for the reason Alt+C is
 * (see shortcut-labels.ts). Returns an unsubscribe function.
 */
export function installSettingsShortcut(open: () => void): () => void {
  const onKeydown = (event: KeyboardEvent): void => {
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.code === 'Comma'
    ) {
      event.preventDefault();
      event.stopPropagation();
      open();
    }
  };
  document.addEventListener('keydown', onKeydown, { capture: true });
  return () => document.removeEventListener('keydown', onKeydown, { capture: true });
}
