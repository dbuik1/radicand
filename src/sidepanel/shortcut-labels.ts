/**
 * How keyboard shortcuts are written wherever the panel names them: the Copy
 * button's tooltip, the Keyboard shortcuts reference, the `\` finder's empty
 * state, the Style menu, the collapsed Symbols row.
 *
 * Each binding is one physical key everywhere (see the installers beside each
 * feature); only the LABEL is platform-aware, since the same keys are printed
 * "Alt" and "Ctrl" on PC keyboards and "Option" and "Cmd" on Mac ones. They
 * live together here so the whole panel names the modifiers the same way, and
 * so any module can read a label without pulling in the feature that owns the
 * shortcut.
 */

/** Is this a Mac keyboard, as far as the browser will say? */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
}

/**
 * Copy the whole equation, from anywhere in the panel. Alt+C was chosen over
 * the alternatives considered:
 * - Ctrl+Shift+C is Chrome/Chromium's built-in DevTools "inspect element"
 *   shortcut and would be swallowed before it ever reached the page.
 * - Bare Ctrl+C is the browser's native copy, which (correctly) does nothing
 *   useful with MathLive's collapsed-selection default – hijacking it would
 *   break normal copy-paste of surrounding UI text.
 * - Alt+C does not appear in MathLive's own keybinding table (checked against
 *   its shipped keybindings) and is not claimed by Chrome or the OS, so it is
 *   free to use here.
 */
export const COPY_SHORTCUT_LABEL = isMacPlatform() ? 'Option+C' : 'Alt+C';

/** Save the equation (or the selection) to the library: Alt+C's neighbour. */
export const SAVE_SHORTCUT_LABEL = isMacPlatform() ? 'Option+S' : 'Alt+S';

/**
 * The primary modifier, as the keyboard prints it and as `aria-keyshortcuts`
 * spells it. Chrome maps a "Ctrl" default binding to Command on a Mac, so
 * the browser commands below read the same way as the panel's own chords.
 */
export const PRIMARY_MODIFIER_LABEL = isMacPlatform() ? 'Cmd' : 'Ctrl';
export const PRIMARY_MODIFIER_KEY = isMacPlatform() ? 'Meta' : 'Control';

/** Put focus in the Symbols search box, from anywhere in the panel. */
export const SEARCH_SHORTCUT_LABEL = `${PRIMARY_MODIFIER_LABEL}+/`;
/** The same chord as `aria-keyshortcuts` spells it. */
export const SEARCH_SHORTCUT_KEYS = `${PRIMARY_MODIFIER_KEY}+/`;

/** Open or close the side panel: the browser command's default binding. */
export const PANEL_SHORTCUT_LABEL = `${PRIMARY_MODIFIER_LABEL}+Shift+U`;

/** Show or hide the symbols: the browser command's default binding. */
export const SYMBOLS_SHORTCUT_LABEL = `${PRIMARY_MODIFIER_LABEL}+Shift+Y`;

/**
 * Open Settings from anywhere in the panel. Its own route – More ▾ ›
 * Settings – is one of the pieces of interface a user can switch off, so
 * Settings needs a route that cannot be switched off with it: the shortcut is
 * what makes every other toggle safely reversible. Alt+, is free for the same
 * reasons Alt+C is (see above), and matches on the physical key.
 */
export const SETTINGS_SHORTCUT_LABEL = isMacPlatform() ? 'Option+,' : 'Alt+,';
/**
 * The same chord for `aria-keyshortcuts`, which names the key rather than the
 * legend on it and spells the Option key "Alt" on every platform.
 */
export const SETTINGS_SHORTCUT_KEYS = 'Alt+Comma';
