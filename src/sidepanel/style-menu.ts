/**
 * The Style ▾ menu in the equation header: six `menuitemcheckbox` entries,
 * one per text style (styling.ts). Behaviour is the word-processor model –
 * toggle the selection, or arm a sticky style at a collapsed caret – and
 * every state change is announced, because arming a style changes nothing
 * visible.
 *
 * Each item's checked state is a tri-state (`true` / `mixed` / `false`)
 * derived from MathLive's `queryStyle` when the menu opens and on every
 * selection change – `mixed` when only part of the selection carries the
 * style. MathLive's own context menu hides styling items in this situation;
 * staying available with an honest state is the point of building our own.
 *
 * Opening the menu moves focus out of the field, so the selection is captured
 * on open and restored just before the style is applied; focus then returns
 * to the field so the user can carry on typing in the chosen style.
 */
import type { EditorController } from './editor';
import { STYLE_COMMANDS, applyStyleCommand, pendingStyleNames } from './editor/styling';
import { PRIMARY_MODIFIER_KEY, PRIMARY_MODIFIER_LABEL } from './shortcut-labels';
import { announce } from './a11y';
import { createMenu, type MenuController, type MenuItem } from './menu';

/** The six styles, in menu order. Glyphs are the styled letterforms. */
const STYLES: { name: string; glyph: string; label: string; key?: string }[] = [
  { name: 'mathbf', glyph: '\u{1D401}', label: 'Bold', key: 'B' },
  { name: 'mathit', glyph: '\u{1D43C}', label: 'Italic', key: 'I' },
  { name: 'mathrm', glyph: 'R', label: 'Upright' },
  { name: 'mathbb', glyph: 'ℝ', label: 'Blackboard bold' },
  { name: 'mathscr', glyph: 'ℛ', label: 'Calligraphic' },
  { name: 'mathfrak', glyph: 'ℜ', label: 'Fraktur (German)' },
];

export function createStyleMenu(editor: EditorController): MenuController {
  const mf = editor.element;
  let savedSelection: typeof mf.selection | null = null;

  /** Tri-state for one style from the field's current selection. */
  const stateOf = (name: string): boolean | 'mixed' => {
    // queryStyle is unreliable in an empty field (no previous atom to derive
    // the implicit style from): there, an item is checked exactly when its
    // style is armed pending the first content (styling.ts).
    const empty = mf.getValue('latex').trim() === '';
    if (empty) return pendingStyleNames(mf).has(name);
    const state = mf.queryStyle(STYLE_COMMANDS[name]!.style);
    return state === 'all' ? true : state === 'some' ? 'mixed' : false;
  };

  const entries: MenuItem[] = STYLES.map(({ name, glyph, label, key }) => {
    const item: MenuItem = {
      kind: 'checkbox',
      glyph,
      label,
      checked: () => stateOf(name),
      focusAfter: 'none',
      onSelect: () => {
        // Focus first so MathLive applies the style to a live field, then
        // put the selection back exactly as it was when the menu opened.
        editor.focus();
        if (savedSelection) mf.selection = savedSelection;
        applyStyleCommand(mf, name, announce);
        menu.sync();
      },
    };
    if (key) {
      item.shortcut = `${PRIMARY_MODIFIER_LABEL}+${key}`;
      item.keyshortcuts = `${PRIMARY_MODIFIER_KEY}+${key}`;
    }
    return item;
  });

  const menu = createMenu({
    id: 'style',
    label: 'Style',
    entries,
    onOpen: () => {
      savedSelection = mf.selection;
    },
  });
  // The visible "Style" text names the trigger; this tells AT what it opens.
  menu.trigger.setAttribute('aria-label', 'Style');
  menu.trigger.title = 'Text style: bold, italic and other letterforms';

  mf.addEventListener('selection-change', menu.sync);
  mf.addEventListener('input', menu.sync);
  menu.sync();

  return menu;
}
