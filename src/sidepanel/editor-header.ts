/**
 * The header row above the field: the "Equation" heading on the left and the
 * Settings button on the right, plus the keyboard route to Settings.
 *
 * The heading is the equation field's accessible name, so switching it off
 * hides it from the screen only (see interface-parts.ts). The Settings button
 * is not a piece the user can switch off: it is the way back to every piece
 * that is.
 */
import { bindPart } from './part-visibility';
import { SETTINGS_SHORTCUT_KEYS } from './shortcut-labels';

export interface EditorHeader {
  /** The header row; mount this above the field. */
  root: HTMLElement;
  /** The heading, which also names the field (`aria-labelledby`). */
  label: HTMLElement;
  /** The Settings button; the host opens the Settings mode from it. */
  settings: HTMLButtonElement;
}

export function createEditorHeader(): EditorHeader {
  const label = document.createElement('h2');
  label.className = 'editor-title';
  label.id = 'editor-label';
  label.textContent = 'Equation';
  bindPart('equationHeading', label);

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.id = 'settings-trigger';
  settings.className = 'btn btn--secondary btn--slim editor-header__settings';
  settings.textContent = 'Settings';
  settings.setAttribute('aria-keyshortcuts', SETTINGS_SHORTCUT_KEYS);

  const root = document.createElement('div');
  root.className = 'editor-header';
  root.append(label, settings);

  return { root, label, settings };
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
