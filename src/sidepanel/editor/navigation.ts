/**
 * Caret navigation around operator limits and accents: ArrowUp / ArrowDown
 * jump to an operator's existing top / bottom limit, and a click next to an
 * unfilled accent is redirected onto that accent's placeholder.
 */
import type { MathfieldElement } from 'mathlive';

/**
 * Command names of operators that carry sub/superscript limits. Order matters:
 * longer names first so `iiint` is not shadowed by `iint`/`int` in
 * alternations.
 */
export const LIMIT_OPERATOR_NAMES =
  'iiint|iint|oint|int|sum|prod|coprod|bigcup|bigcap|bigoplus|bigotimes|bigvee|bigwedge|lim';

/**
 * Operators that carry sub/superscript *limits* (as opposed to plain scripts).
 * The trailing `(?![a-zA-Z])` marks the end of the command name without using
 * `\b` – a word boundary fails here because the command is followed by `_`,
 * which regex counts as a word character (so `\bint\b` would not match `\int_`).
 */
const OPERATOR_WITH_LIMITS = new RegExp(`\\\\(?:${LIMIT_OPERATOR_NAMES})(?![a-zA-Z])`);

/**
 * Let ArrowUp / ArrowDown jump to an operator's top / bottom limit. MathLive
 * already navigates fractions and matrices with up/down, but for an integral or
 * sum it does not, so pressing up/down from the integrand (just after the
 * operator) is wired to `moveToSuperscript` / `moveToSubscript`. Any other
 * position is left to MathLive's own up/down handling.
 */
export function installLimitArrowKeys(mf: MathfieldElement): void {
  mf.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      // Modified arrows are something else entirely (Shift+Arrow extends the
      // selection) – leave them to MathLive.
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (mf.mode !== 'math') return;
      // Only act when the atom just before the caret is an operator with limits
      // (the integrand position), and only to JUMP to a limit that already
      // exists: moveToSuperscript/moveToSubscript would otherwise *create* the
      // missing script, and an arrow key must never mutate the equation.
      const leftLatex = mf.getElementInfo(mf.position)?.latex ?? '';
      if (!OPERATOR_WITH_LIMITS.test(leftLatex)) return;
      if (!(event.key === 'ArrowUp' ? /\^/.test(leftLatex) : /_/.test(leftLatex))) return;
      const before = JSON.stringify(mf.selection.ranges);
      mf.executeCommand(
        event.key === 'ArrowUp' ? 'moveToSuperscript' : 'moveToSubscript',
      );
      // Only claim the key if it actually moved (e.g. `\lim` has no superscript).
      if (JSON.stringify(mf.selection.ranges) !== before) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

/**
 * Accent commands whose body is still an unfilled placeholder. MathLive gives
 * the atoms *inside* an accent's vertical list no hit-test bounds, so a mouse
 * click can never land in the accent's body – an empty `\hat{▢}` is
 * unreachable by mouse, making its placeholder impossible to fill by clicking
 * (keyboard users can Tab to it). Kept to true accents: `\overline` renders
 * as a rule, not a vertical list, so its body IS natively clickable – for it
 * and everything else MathLive's own hit-testing must not be second-guessed.
 */
const ACCENT_SKELETON = /^\\(?:hat|vec|bar)\{\\placeholder\{\}\}$/;

/**
 * After a click, if MathLive left the caret collapsed right next to an accent
 * whose body is just a placeholder, move the selection onto that placeholder
 * so the click "lands inside" and typing fills the accent. Runs on pointerup,
 * a beat after MathLive's own pointer handling has placed the caret.
 */
export function installAccentClickRedirect(mf: MathfieldElement): void {
  mf.addEventListener('pointerup', () => {
    setTimeout(() => {
      if (mf.mode !== 'math') return;
      const range = mf.selection.ranges[0];
      if (!range || range[0] !== range[1]) return; // only a collapsed caret
      const pos = mf.position;
      // The clicked accent atom either ends at the caret (caret landed on its
      // right) or at the next offset (caret landed on its left).
      for (const atomEnd of [pos, pos + 1]) {
        if (atomEnd < 2 || atomEnd > mf.lastOffset) continue;
        const latex = mf.getElementInfo(atomEnd)?.latex?.trim() ?? '';
        if (!ACCENT_SKELETON.test(latex)) continue;
        // Post-order offsets: the accent's placeholder is the atom just
        // before the accent atom itself.
        mf.selection = { ranges: [[atomEnd - 2, atomEnd - 1]] };
        return;
      }
    }, 0);
  });
}
