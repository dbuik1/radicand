/**
 * Applying the interface-part flags to the panel.
 *
 * Each piece of interface has exactly one owner – the module that builds it –
 * and that owner registers its element here with {@link bindPart}. The flag
 * is applied at once and again on every settings change, so switching a piece
 * off in Settings takes effect in the panel behind it without a reload, and a
 * change made in a second editor window arrives the same way.
 *
 * Nothing here reads the DOM to decide what to hide: the part table
 * (interface-parts.ts) says what "off" means for each piece, this module does
 * it, and the owners never test the flags themselves.
 */
import { announce } from './a11y';
import type { InterfacePart, Settings } from '../types';
import { INTERFACE_PARTS, interfacePartSpec } from './interface-parts';
import { getSettings, onSettingsChange, updateSettings } from './settings';

/** Is this piece of the interface on screen? */
export function isPartShown(part: InterfacePart, settings: Settings = getSettings()): boolean {
  return settings.parts[part];
}

/** The pieces currently switched off, in the order Settings lists them. */
export function hiddenParts(settings: Settings = getSettings()): InterfacePart[] {
  return INTERFACE_PARTS.filter((spec) => !settings.parts[spec.part]).map((spec) => spec.part);
}

/** Switch one piece on or off, keeping every other flag as it is. */
export async function setPart(part: InterfacePart, shown: boolean): Promise<void> {
  await updateSettings({ parts: { ...getSettings().parts, [part]: shown } });
}

/** Switch every piece back on. */
export async function showEveryPart(): Promise<void> {
  const parts = { ...getSettings().parts };
  for (const spec of INTERFACE_PARTS) parts[spec.part] = true;
  await updateSettings({ parts });
}

/**
 * Show or hide `el` with its part. Returns an unsubscribe function; the panel
 * itself never unmounts, so only tests use it.
 */
export function bindPart(part: InterfacePart, el: HTMLElement): () => void {
  const { mode } = interfacePartSpec(part);
  const apply = (settings: Settings): void => {
    const shown = settings.parts[part];
    if (mode === 'hide-visually') el.classList.toggle('visually-hidden', !shown);
    else el.hidden = !shown;
  };
  apply(getSettings());
  return onSettingsChange(apply);
}

/**
 * Run `apply` with the current settings and again whenever they change – for
 * owners whose reaction is more than one element going away (a row that
 * collapses once everything in it is off, say). Returns an unsubscribe
 * function.
 */
export function bindToSettings(apply: (settings: Settings) => void): () => void {
  apply(getSettings());
  return onSettingsChange(apply);
}

/**
 * The single owner of "that piece is now off screen" feedback.
 *
 * A flag can change from Settings, from the Ctrl+Shift+Y command, or from a
 * second editor window, and each of those used to speak for itself. Saying it
 * once here means a user who switches four pieces off hears one sentence
 * rather than four, and the checkboxes in Settings stay silent: the change
 * they describe is announced from the panel it happened to, not from the
 * control that asked for it.
 *
 * Whatever went may have held focus, which leaves focus on `<body>` and the
 * keyboard with nowhere to go, so `rescueFocus` is called on the next frame
 * when that has happened. Returns an unsubscribe function.
 */
export function installPartAnnouncements(rescueFocus: () => void): () => void {
  let previous = { ...getSettings().parts };
  return onSettingsChange((next) => {
    const changed = INTERFACE_PARTS.filter(
      (spec) => next.parts[spec.part] !== previous[spec.part],
    );
    if (changed.length === 0) return;
    const shown = changed.filter((spec) => next.parts[spec.part]);
    previous = { ...next.parts };

    const only = changed.length === 1 ? changed[0] : undefined;
    if (only) {
      announce(`${only.label} ${shown.length === 1 ? 'shown' : 'hidden'}`);
    } else if (shown.length === changed.length) {
      announce(`${changed.length} pieces of the interface shown`);
    } else if (shown.length === 0) {
      announce(`${changed.length} pieces of the interface hidden`);
    } else {
      announce(`${shown.length} pieces of the interface shown, ${changed.length - shown.length} hidden`);
    }

    requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === null) {
        rescueFocus();
      }
    });
  });
}
