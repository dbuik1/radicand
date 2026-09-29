/**
 * Structure-aware Backspace: deleting into a built structure peels it apart
 * one meaningful piece at a time (an integral's limits before the integral
 * itself) rather than destroying the whole atom in a single keystroke.
 */
import type { MathfieldElement } from 'mathlive';
import { LIMIT_OPERATOR_NAMES } from './navigation';
import { depthAtOffset } from './offsets';

/** A MathLive placeholder atom's serialised LaTeX form. */
const PLACEHOLDER_LATEX = /^\\placeholder\{\}$/;

/** An empty subscript / superscript group anywhere in a structure's LaTeX. */
const EMPTY_SUBSCRIPT = /_\{\\placeholder\{\}\}/;
const EMPTY_SUPERSCRIPT = /\^\{\\placeholder\{\}\}/;

/** A *bare* limit operator (e.g. exactly `\int`) – no scripts, nothing else. */
const BARE_LIMIT_OPERATOR = new RegExp(`^\\\\(?:${LIMIT_OPERATOR_NAMES})$`);

/** Count the placeholder atoms in a LaTeX fragment. */
function countPlaceholders(latex: string): number {
  return (latex.match(/\\placeholder\{\}/g) ?? []).length;
}

/**
 * Remove the *focused* empty script from an empty operator's LaTeX, so Backspace
 * deletes whichever limit currently has focus. `rank` is the focused
 * placeholder's position in MathLive's offset order (0 = first). For an operator
 * with both limits (`\op_{▢}^{▢}`) MathLive's offset order is
 * superscript-then-subscript, so rank 0 is the top limit – the one focused right
 * after the operator is created. Returns null when there is no removable script
 * (so the whole structure is deleted): `\frac{▢}{▢}`, `\sqrt{▢}`, matrices, and
 * a bare `\int` all take that path. Examples:
 *   `\int_{▢}^{▢}` rank 0 → `\int_{▢}`  (top limit removed first)
 *   `\int_{▢}^{▢}` rank 1 → `\int^{▢}`  (bottom limit removed first)
 *   `\int_{▢}`     rank 0 → `\int`       (then the bare operator is deleted)
 */
export function removeFocusedScript(latex: string, rank: number): string | null {
  const hasSub = EMPTY_SUBSCRIPT.test(latex);
  const hasSup = EMPTY_SUPERSCRIPT.test(latex);
  if (hasSub && hasSup) {
    return rank === 0 ? latex.replace(EMPTY_SUPERSCRIPT, '') : latex.replace(EMPTY_SUBSCRIPT, '');
  }
  if (hasSup) return latex.replace(EMPTY_SUPERSCRIPT, '');
  if (hasSub) return latex.replace(EMPTY_SUBSCRIPT, '');
  return null;
}

/**
 * Is every interior leaf atom of the offset range `(start, end)` an empty
 * placeholder? Used to decide whether a structure is still just an unfilled
 * skeleton. We inspect each atom rather than pattern-matching the LaTeX because
 * MathLive serialises single-token arguments without braces (e.g. `\frac12`),
 * which a brace-based regex would misread as empty.
 */
function rangeIsOnlyPlaceholders(
  mf: MathfieldElement,
  start: number,
  end: number,
): boolean {
  if (end <= start) return false;
  for (let offset = start + 1; offset < end; offset++) {
    const latex = mf.getElementInfo(offset)?.latex?.trim() ?? '';
    if (latex === '' || PLACEHOLDER_LATEX.test(latex)) continue;
    return false;
  }
  return true;
}

/**
 * The offset range of an *empty* structure (only placeholders) that Backspace
 * should remove for a caret at `caret`, or null if ordinary deletion applies.
 * Covers the caret being inside the structure, sitting just before it (the
 * "stranded" state MathLive leaves operators in after a script is deleted), or
 * the whole field being a lone placeholder.
 */
function emptyStructureRange(
  mf: MathfieldElement,
  caret: number,
): [number, number] | null {
  const last = mf.lastOffset;
  // Caret inside a structure: expand to the enclosing top-level span.
  if (depthAtOffset(mf, caret) > 0) {
    let start = caret;
    while (start > 0 && depthAtOffset(mf, start) > 0) start--;
    let end = caret;
    while (end < last && depthAtOffset(mf, end) > 0) end++;
    return rangeIsOnlyPlaceholders(mf, start, end) ? [start, end] : null;
  }
  // Caret at a top-level boundary with a structure immediately to its right.
  if (caret < last && depthAtOffset(mf, caret + 1) > 0) {
    let end = caret + 1;
    while (end < last && depthAtOffset(mf, end) > 0) end++;
    let start = caret;
    // Absorb an immediately-preceding empty placeholder base, e.g. `#?_{#?}`.
    const leftLatex = caret > 0 ? mf.getValue(caret - 1, caret, 'latex').trim() : '';
    if (PLACEHOLDER_LATEX.test(leftLatex)) start = caret - 1;
    if (rangeIsOnlyPlaceholders(mf, start, end)) return [start, end];
  }
  // Whole field is a single empty placeholder.
  if (caret === last && PLACEHOLDER_LATEX.test(mf.getValue('latex').trim())) {
    return [0, last];
  }
  return null;
}

/** Whether a structure's LaTeX is an array environment (matrix, cases, …). */
function isArrayStructure(latex: string): boolean {
  return latex.includes('\\begin{');
}

/**
 * The offset span `(start, end]` of the *innermost* structure atom enclosing
 * `caret`, or null when the caret is at top level. MathLive's offsets are a
 * post-order traversal – an atom's children occupy the run of deeper offsets
 * immediately before the atom itself – so the enclosing atom is the next
 * offset with a smaller depth, and its span starts where the walk back from
 * it first returns to the atom's own depth.
 *
 * This is what lets deletion act on the structure the caret is actually in:
 * for a caret in an integral's limit inside a matrix cell it yields just the
 * integral, while a caret directly in a cell yields the whole matrix (a cell
 * is not an atom of its own). Expanding to depth 0 instead would conflate
 * every nested structure with its outermost ancestor.
 */
function enclosingAtomSpan(
  mf: MathfieldElement,
  caret: number,
): [number, number] | null {
  const depth = depthAtOffset(mf, caret);
  if (depth === 0) return null;
  let end = caret;
  while (end < mf.lastOffset && depthAtOffset(mf, end) >= depth) end++;
  if (depthAtOffset(mf, end) >= depth) return null; // malformed; be safe
  const parentDepth = depthAtOffset(mf, end);
  let start = end - 1;
  while (start > 0 && depthAtOffset(mf, start) > parentDepth) start--;
  return [start, end];
}

/**
 * Make Backspace on an *empty* structure (one containing only placeholders)
 * behave predictably, without stranding the caret or wiping a whole structure in
 * one press. There are two cases:
 *
 * 1. A lone empty placeholder is *selected* (the state right after insert / Tab /
 *    arrow):
 *    - Operators with limits peel the focused limit, so deletion follows focus.
 *      A just-created integral focuses its top limit, giving
 *      `\int_{▢}^{▢}` → `\int_{▢}` → `\int` → (gone); Tab to the lower limit
 *      first and it goes first instead.
 *    - Arrays (matrices, cases) are left to MathLive, so Backspace clears just
 *      that cell rather than deleting the whole grid.
 *    - Other script-less structures (`\frac{▢}{▢}`, `\sqrt{▢}`, …) are removed
 *      whole, matching how MathLive already deletes an empty `\sqrt{}`.
 *
 * 2. The caret is *collapsed*. MathLive's own deletion runs (so backspacing from
 *    the integrand position steps into the limits rather than deleting the
 *    integral). Only if that is a genuine no-op do we step back a character –
 *    so an empty matrix cell is a navigation step, not a dead end.
 *
 * Structures the user has typed into are always left to MathLive untouched.
 */
export function installStructureBackspace(mf: MathfieldElement): void {
  mf.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'Backspace') return;
      // Modified deletions (Ctrl/Alt/Meta+Backspace delete a word or group)
      // are MathLive's own bindings – never reroute them into single-step
      // structure handling.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (mf.mode !== 'math') return; // never interfere with raw LaTeX/text
      const selection = mf.selection;
      const range = selection.ranges[0];
      if (!range) return;
      const collapsed = selection.ranges.length === 1 && range[0] === range[1];

      // Case 1: a lone empty placeholder is selected.
      if (!collapsed) {
        const lo = Math.min(range[0], range[1]);
        const hi = Math.max(range[0], range[1]);
        // Any other selection is an ordinary range delete – leave it to MathLive.
        if (!PLACEHOLDER_LATEX.test(mf.getValue(lo, hi, 'latex').trim())) return;
        // The innermost structure holding the selection – so a limit selected
        // on an integral inside a matrix cell peels the integral, not the
        // matrix. Falls back to top-level expansion for carets at depth 0
        // (a lone placeholder field, `#?_{#?}` boundaries).
        const span = enclosingAtomSpan(mf, hi) ?? emptyStructureRange(mf, hi);
        if (!span) return;
        const structLatex = mf.getValue(span[0], span[1], 'latex');
        // Never wipe or rewrite a matrix/cases because one cell is selected –
        // let MathLive clear that cell instead. (Checked before the script
        // peel: a matrix containing an integral elsewhere must not have that
        // integral's scripts "peeled" out of the whole-matrix LaTeX.)
        if (isArrayStructure(structLatex)) return;
        // Only unfilled skeletons are ours; anything typed-into is MathLive's.
        if (!rangeIsOnlyPlaceholders(mf, span[0], span[1])) return;
        // The focused limit's rank is how many placeholders precede it.
        const rank = countPlaceholders(mf.getValue(span[0], lo, 'latex'));
        const reduced = removeFocusedScript(structLatex, rank);
        if (reduced !== null && reduced !== structLatex) {
          // Peel one limit: replace with the reduced form (selecting the
          // remaining placeholder). The value shrinks, so the auto-box `input`
          // handler won't re-expand it.
          event.preventDefault();
          event.stopImmediatePropagation();
          mf.selection = { ranges: [span] };
          mf.insert(reduced, { selectionMode: 'placeholder', focus: true });
          return;
        }
        // Script-less structure (fraction, root, …): remove it whole.
        event.preventDefault();
        event.stopImmediatePropagation();
        mf.selection = { ranges: [span] };
        mf.executeCommand('deleteBackward');
        return;
      }

      // Case 2: collapsed caret. Let MathLive delete; only recover a dead end.
      event.preventDefault();
      event.stopImmediatePropagation();
      const caret = mf.position;
      const depthBefore = depthAtOffset(mf, caret);

      // A collapsed caret sitting immediately OUTSIDE a complete array
      // structure (e.g. after ArrowRight out of the last cell, or a mouse
      // click placed right after the matrix) must not be handed to native
      // deleteBackward: MathLive treats a whole array as a single atom from
      // that boundary and deletes it – and everything inside it – in one
      // press, regardless of how many cells are filled. Step the caret back
      // inside instead, so a Backspace here is a navigation move into the
      // last cell rather than a whole-matrix deletion.
      if (depthBefore === 0 && caret > 0 && isArrayStructure(mf.getElementInfo(caret)?.latex ?? '')) {
        mf.position = caret - 1;
        return;
      }

      const beforeValue = mf.getValue('latex');
      mf.executeCommand('deleteBackward');
      if (mf.getValue('latex') !== beforeValue || mf.position !== caret) {
        // Native deletion did something. When it removes an operator's last
        // empty script, MathLive parks the caret on the operator's LEFT, which
        // strands the bare operator (the next Backspace skips it). Detect that
        // exit – caret left a structure and now sits at top level with a bare
        // limit operator immediately to its right – and step back inside so
        // deletion continues in order.
        const after = mf.position;
        if (
          depthBefore > 0 &&
          depthAtOffset(mf, after) === 0 &&
          after + 1 <= mf.lastOffset &&
          BARE_LIMIT_OPERATOR.test(mf.getElementInfo(after + 1)?.latex?.trim() ?? '')
        ) {
          mf.position = after + 1;
        }
        return;
      }
      // Native deletion did nothing: the caret is at a spot MathLive won't
      // delete from (an empty cell, an emptied structure). Recover based on
      // the innermost enclosing structure.
      if (depthAtOffset(mf, caret) > 0) {
        const span = enclosingAtomSpan(mf, caret);
        if (span) {
          const structLatex = mf.getValue(span[0], span[1], 'latex');
          if (isArrayStructure(structLatex)) {
            // In a grid, Backspace in an empty cell is a navigation move to
            // the previous cell. Only when the caret has reached the grid's
            // FIRST interior position with nothing but placeholders left does
            // the press remove the whole husk – the final step of a deletion
            // the user has driven cell by cell.
            if (
              caret - 1 <= span[0] &&
              rangeIsOnlyPlaceholders(mf, span[0], span[1])
            ) {
              mf.selection = { ranges: [span] };
              mf.executeCommand('deleteBackward');
              return;
            }
            mf.executeCommand('moveToPreviousChar');
            return;
          }
          // A non-grid husk (an emptied fraction, root, …) with no limits to
          // peel: delete it whole, finishing the deletion in progress.
          // Operators keep their limits (script check); a fresh structure is
          // protected by Case 1, which peels or clears the selected slot.
          if (
            rangeIsOnlyPlaceholders(mf, span[0], span[1]) &&
            removeFocusedScript(structLatex, 0) === null
          ) {
            mf.selection = { ranges: [span] };
            mf.executeCommand('deleteBackward');
            return;
          }
        }
      }
      // Otherwise step back (e.g. out of an empty matrix cell) so the press is
      // a navigation move rather than a dead end.
      mf.executeCommand('moveToPreviousChar');
    },
    true, // capture: run before MathLive's own Backspace handling
  );
}
