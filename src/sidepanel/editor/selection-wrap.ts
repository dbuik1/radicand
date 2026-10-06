import type { MathfieldElement } from 'mathlive';

/**
 * What was selected when a `\`-command began. MathLive replaces a selection
 * with the typed backslash, so by the time a trigger is confirmed the
 * selection is gone from the field: it has to be read at the keystroke, and
 * only the keystroke can say it was the user's selection and not stale.
 */
export interface SelectionWrap {
  /** The LaTeX captured at the last `\`, once; null when nothing was selected. */
  take(): string | null;
}

export function installSelectionCapture(mf: MathfieldElement): SelectionWrap {
  let captured: string | null = null;

  mf.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== '\\' || event.ctrlKey || event.metaKey || event.altKey) return;
      // Every backslash starts afresh, so an abandoned command never leaves a
      // selection behind for a later one to wrap.
      captured = null;
      if (mf.mode !== 'math' || mf.selectionIsCollapsed) return;
      const latex = mf.getValue(mf.selection, 'latex');
      if (latex.trim() !== '') captured = latex;
    },
    { capture: true },
  );
  // Leaving LaTeX mode without taking it (Escape, a click away) abandons it.
  mf.addEventListener('mode-change', () => {
    if (mf.mode !== 'latex') captured = null;
  });

  return {
    take(): string | null {
      const latex = captured;
      captured = null;
      return latex;
    },
  };
}

const EMPTY_SLOT = /\\placeholder(?:\[[^\]]*\])?\{\}/;

/**
 * The template with `selected` in its first empty slot, or null when it has
 * none – such a template has nowhere to put the selection, so it replaces
 * it as it always has.
 */
export function wrapIntoFirstSlot(template: string, selected: string): string | null {
  if (!EMPTY_SLOT.test(template)) return null;
  // A function replacer: `$` in the LaTeX is not a replacement pattern.
  return template.replace(EMPTY_SLOT, () => selected);
}
