/**
 * The Styles category of the symbol palette: six toggle keys, one per text
 * style (styling.ts). Behaviour is the word-processor model: a key toggles
 * the style on the selection, or arms it at a collapsed caret, and every
 * change is announced, because arming a style changes nothing visible.
 *
 * Each key's pressed state is a tri-state (`true` / `mixed` / `false`) read
 * from MathLive's `queryStyle` on every selection change; `mixed` means only
 * part of the selection carries the style.
 *
 * A key press from the keyboard happens with focus outside the field, so the
 * selection is read first and put back once the field has focus again; focus
 * then stays in the field so typing carries on in the chosen style.
 */
import type { EditorController } from './editor';
import { STYLE_COMMANDS, applyStyleCommand, pendingStyleNames } from './editor/styling';
import { PRIMARY_MODIFIER_KEY, PRIMARY_MODIFIER_LABEL } from './shortcut-labels';
import { announce } from './a11y';
import { wireRovingTabindex } from './roving';

/** The six styles, in key order. Glyphs are the styled letterforms. */
const STYLES: { name: string; glyph: string; label: string; key?: string }[] = [
  { name: 'mathbf', glyph: '\u{1D401}', label: 'Bold', key: 'B' },
  { name: 'mathit', glyph: '\u{1D43C}', label: 'Italic', key: 'I' },
  { name: 'mathrm', glyph: 'R', label: 'Upright' },
  { name: 'mathbb', glyph: 'ℝ', label: 'Blackboard bold' },
  { name: 'mathscr', glyph: 'ℛ', label: 'Calligraphic' },
  { name: 'mathfrak', glyph: 'ℜ', label: 'Fraktur' },
];

export function buildStyleKeys(editor: EditorController): HTMLElement {
  const mf = editor.element;

  /** Tri-state for one style from the field's current selection. */
  const stateOf = (name: string): 'true' | 'mixed' | 'false' => {
    // queryStyle is unreliable in an empty field (no previous atom to derive
    // the implicit style from): there, a key is pressed exactly when its
    // style is armed pending the first content (styling.ts).
    if (mf.getValue('latex').trim() === '') return String(pendingStyleNames(mf).has(name)) as 'true' | 'false';
    const state = mf.queryStyle(STYLE_COMMANDS[name]!.style);
    return state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false';
  };

  const grid = document.createElement('div');
  grid.className = 'palette__grid style-keys';
  grid.setAttribute('role', 'toolbar');
  grid.setAttribute('aria-label', 'Text styles');

  const buttons = STYLES.map(({ name, glyph, label, key }, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette__btn style-keys__key';
    btn.dataset.style = name;
    btn.textContent = glyph;
    btn.setAttribute('aria-label', label);
    btn.title = key ? `${label} (${PRIMARY_MODIFIER_LABEL}+${key})` : label;
    if (key) btn.setAttribute('aria-keyshortcuts', `${PRIMARY_MODIFIER_KEY}+${key}`);
    btn.tabIndex = index === 0 ? 0 : -1;
    // A pointer press must not take focus, and with it the selection, out of
    // the field.
    btn.addEventListener('mousedown', (event) => event.preventDefault());
    btn.addEventListener('click', () => {
      const selection = mf.selection;
      editor.focus();
      mf.selection = selection;
      applyStyleCommand(mf, name, announce);
      sync();
    });
    grid.appendChild(btn);
    return btn;
  });

  const sync = (): void => {
    for (const btn of buttons) btn.setAttribute('aria-pressed', stateOf(btn.dataset.style!));
  };
  mf.addEventListener('selection-change', sync);
  mf.addEventListener('input', sync);
  sync();

  wireRovingTabindex(grid, buttons, {
    columns: () => buttons.length,
    onEscape: () => editor.focus(),
  });
  return grid;
}
