/**
 * The styling model: styles, not structures.
 *
 * `\mathbf`, `\mathbb` and friends are styles. Following the word-processor
 * convention (Microsoft's RichEdit statement of it: formatting at the
 * insertion point applies to newly typed text only when the selection is
 * empty; otherwise it applies to the selection), each styling affordance is
 * ONE control whose behaviour branches on the selection:
 *
 * - selection present – toggle the style on the selected atoms;
 * - caret collapsed – arm a "sticky" style for the next characters typed.
 *
 * MathLive implements both branches natively: `applyStyle(style,
 * {operation:'toggle'})` does the branching, and `queryStyle(style)` returns
 * `'all' | 'some' | 'none'` – a ready-made tri-state for `aria-pressed`.
 * This module owns the command → style table and the announcement copy;
 * the Style menu (style-menu.ts) and the typed-command path (index.ts) both
 * call {@link applyStyleCommand} so the two behave identically.
 *
 * Arming a sticky style changes nothing visible at a collapsed caret, so
 * every transition is announced through the live region – no surveyed
 * editor does this, and it is the point of doing styling in this product.
 */
import type { MathfieldElement } from 'mathlive';
import { isMacPlatform } from '../shortcut-labels';

/** The style payload MathLive's applyStyle/queryStyle accept. */
export interface StyleSpec {
  variant?: 'double-struck' | 'script' | 'fraktur' | 'sans-serif' | 'monospace';
  variantStyle?: 'up' | 'bold' | 'italic';
}

export interface StyleCommand {
  /** User-facing name, used in announcements and accessible labels. */
  label: string;
  style: StyleSpec;
}

/**
 * Typed `\`-commands that are styles, keyed by command name. Calligraphic
 * commands map to the `script` variant: MathLive 0.110 loses `\mathcal`'s
 * style in the MathML export while `\mathscr` survives correctly (see
 * mathml-export.test.ts). `\bm` is deliberately absent: auto-accept fires on
 * an exact unique match, and `bm` is a strict prefix of `\bmod` – listing it
 * would hijack that command mid-typing. `\boldsymbol` covers the intent.
 */
export const STYLE_COMMANDS: Record<string, StyleCommand> = {
  mathbf: { label: 'Bold', style: { variantStyle: 'bold' } },
  boldsymbol: { label: 'Bold', style: { variantStyle: 'bold' } },
  mathit: { label: 'Italic', style: { variantStyle: 'italic' } },
  mathrm: { label: 'Upright', style: { variantStyle: 'up' } },
  mathbb: { label: 'Blackboard bold', style: { variant: 'double-struck' } },
  mathcal: { label: 'Calligraphic', style: { variant: 'script' } },
  mathscr: { label: 'Calligraphic', style: { variant: 'script' } },
  mathfrak: { label: 'Fraktur', style: { variant: 'fraktur' } },
  mathsf: { label: 'Sans serif', style: { variant: 'sans-serif' } },
  mathtt: { label: 'Monospace', style: { variant: 'monospace' } },
};

/**
 * If `latex` ends with a bare style command (optionally with empty braces),
 * return its command name. Same shape as templates.ts's trailingStructure,
 * with the same `(?![a-zA-Z])`-free tail anchoring on end-of-string.
 */
export function trailingStyleCommand(latex: string): string | null {
  for (const command of Object.keys(STYLE_COMMANDS)) {
    if (new RegExp(`\\\\${command}(?:\\{\\})?\\s*$`).test(latex)) return command;
  }
  return null;
}


/**
 * Styles armed in an EMPTY field, applied to the first content that arrives.
 *
 * MathLive cannot arm a sticky style with no previous atom: `defaultStyle`
 * derives from the atom before the caret, so `applyStyle` at a collapsed
 * caret in an empty field is a no-op – and a styled placeholder is no
 * escape either, because replacing a placeholder discards its style (both
 * verified empirically). So the empty-field branch implements the
 * word-processor behaviour directly: hold the style pending, apply it to
 * the first inserted content, and let MathLive's natural continuation (a
 * new character inherits the previous atom's style) carry it from there.
 */
const pendingEmptyFieldStyles = new WeakMap<MathfieldElement, Map<string, StyleCommand>>();

/** Style names armed in `mf` while it is empty (for toolbar state). */
export function pendingStyleNames(mf: MathfieldElement): ReadonlySet<string> {
  return new Set(pendingEmptyFieldStyles.get(mf)?.keys() ?? []);
}

function pendingStylesFor(mf: MathfieldElement): Map<string, StyleCommand> {
  let pending = pendingEmptyFieldStyles.get(mf);
  if (!pending) {
    pending = new Map();
    pendingEmptyFieldStyles.set(mf, pending);
    // One persistent listener per field: when content first arrives, apply
    // every pending style across it and stop being pending.
    mf.addEventListener('input', () => {
      const armed = pendingEmptyFieldStyles.get(mf);
      if (!armed?.size) return;
      if (mf.getValue('latex').trim() === '') return; // still empty
      const commands = [...armed.values()];
      armed.clear();
      for (const { style } of commands) {
        mf.applyStyle(style, { range: [0, mf.lastOffset], operation: 'set' });
      }
      mf.position = mf.lastOffset;
    });
  }
  return pending;
}

/**
 * Apply a style command the word-processor way and announce what happened.
 * `announce` is injected (as for installMatrixKeys) to keep this module
 * free of panel dependencies.
 */
export function applyStyleCommand(
  mf: MathfieldElement,
  name: string,
  announce: (message: string) => void,
): void {
  const command = STYLE_COMMANDS[name];
  if (!command) return;
  const { label, style } = command;
  const selection = mf.selection;
  const range = selection.ranges[0];
  const hasSelection = !!range && range[0] !== range[1];

  if (!hasSelection && mf.getValue('latex').trim() === '') {
    const pending = pendingStylesFor(mf);
    if (pending.has(name)) {
      pending.delete(name);
      announce(`${label} off`);
    } else {
      pending.set(name, command);
      announce(`${label} on: the next characters you type will be ${label.toLowerCase()}`);
    }
    return;
  }

  const before = mf.queryStyle(style);

  mf.applyStyle(style, { operation: 'toggle' });

  const turnedOn = before !== 'all';
  if (hasSelection) {
    announce(turnedOn ? `${label} applied` : `${label} removed`);
  } else {
    announce(
      turnedOn
        ? `${label} on: the next characters you type will be ${label.toLowerCase()}`
        : `${label} off`,
    );
  }
}

/**
 * Install Ctrl+B / Ctrl+I on the field, mirroring the word processors this
 * model comes from. Cmd on a Mac keyboard: there, Ctrl+B is one of
 * MathLive's Emacs-style bindings (move backward), while Cmd+B and Cmd+I
 * are unbound and free. Capture phase so the chord never reaches MathLive's
 * own keybinding table.
 */
export function installStyleShortcuts(
  mf: MathfieldElement,
  announce: (message: string) => void,
): void {
  mf.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      const mac = isMacPlatform();
      const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod || event.altKey || event.shiftKey) return;
      if (mf.mode !== 'math') return;
      const name =
        event.key === 'b' || event.key === 'B'
          ? 'mathbf'
          : event.key === 'i' || event.key === 'I'
            ? 'mathit'
            : null;
      if (!name) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      applyStyleCommand(mf, name, announce);
    },
    true,
  );
}
