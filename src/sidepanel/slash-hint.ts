/**
 * First-use discoverability for the slash-fraction feature: the first time
 * ever the user types `/` while the setting is on (about to build a
 * fraction), show a one-off hint – a screen-reader announcement via the
 * centralised live region, plus a dismissible on-screen status line above
 * the field, with a button to the Settings control that turns the feature
 * off. Shown once, ever, via the persisted `slashHintShown` flag.
 */
import { announce } from './a11y';
import type { EditorController } from './editor';
import { getSettings, updateSettings } from './settings';
import { SEARCH_SHORTCUT_LABEL } from './shortcut-labels';

export interface SlashHintHooks {
  /**
   * Open Settings at the slash-fraction control. `from` is the hint's
   * Settings button, where Close returns focus while the hint is still up.
   */
  openSettings: (from: HTMLElement) => void;
}

const HINT_TEXT = `Typing / built a fraction. ${SEARCH_SHORTCUT_LABEL} searches for a symbol instead. You can turn the fraction off in Settings.`;

/**
 * Attached in the bubble phase on the field's host element: MathLive's own
 * keydown handling (inside its shadow DOM) has already run by the time this
 * fires, so this never interferes with the fraction actually being built.
 */
export function installSlashFractionHint(
  editor: EditorController,
  fieldWrap: HTMLElement,
  hooks: SlashHintHooks,
): void {
  editor.element.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== '/') return;
    const settings = getSettings();
    if (!settings.slashFraction || settings.slashHintShown) return;

    void updateSettings({ slashHintShown: true });
    announce(HINT_TEXT);
    showSlashFractionHint(fieldWrap, editor.element, hooks);
  });
}

/**
 * Render the visible, dismissible slash-fraction hint at the top of `host`
 * (the field wrapper), so it reads before the field it describes. Never
 * steals focus, and never disappears on a timer (a time limit on reading
 * would fail WCAG SC 2.2.1) – it stays until dismissed with its button or
 * with Escape from the field.
 *
 * The hint carries `role="status"` for anyone who navigates to it directly,
 * but sets `aria-live="off"` to suppress its own automatic announcement – the
 * message was already spoken once via the centralised `announce()` region in
 * {@link installSlashFractionHint}, and role="status" defaults to
 * `aria-live="polite"`, so leaving it on would announce the same text twice.
 */
function showSlashFractionHint(
  host: HTMLElement,
  field: HTMLElement,
  hooks: SlashHintHooks,
): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'slash-hint';
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'off');

  const text = document.createElement('span');
  text.className = 'slash-hint__text';
  text.textContent = HINT_TEXT;

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'slash-hint__action';
  settingsBtn.textContent = 'Open Settings';
  settingsBtn.addEventListener('click', () => hooks.openSettings(settingsBtn));

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'slash-hint__action';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss this hint');

  let dismissed = false;
  const remove = (): void => {
    if (dismissed) return;
    dismissed = true;
    field.removeEventListener('keydown', onFieldKeydown);
    // If focus is on one of the hint's buttons when it goes, return focus to
    // the field rather than letting it fall to <body>.
    const hadFocus = hint.contains(document.activeElement);
    hint.remove();
    if (hadFocus) field.focus();
  };
  // Escape dismisses while focus is in the field, without swallowing Escape
  // for anything else MathLive itself does with it.
  const onFieldKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') remove();
  };

  dismissBtn.addEventListener('click', remove);
  field.addEventListener('keydown', onFieldKeydown);

  hint.append(text, settingsBtn, dismissBtn);
  host.prepend(hint);
  return hint;
}
