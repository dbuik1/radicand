/**
 * In-matrix editing keys. MathLive can add rows/columns to an array environment
 * but binds no keys for it; while the caret is inside a matrix/cases grid,
 * Ctrl+Enter appends a row below and Ctrl+Shift+Enter a column to the right.
 */
import type { MathfieldElement } from 'mathlive';
import { depthAtOffset } from './offsets';

/** Whether the caret sits inside an array environment (matrix, cases, …). */
function caretInArray(mf: MathfieldElement): boolean {
  const caret = mf.position;
  if (depthAtOffset(mf, caret) === 0) return false;
  let start = caret;
  while (start > 0 && depthAtOffset(mf, start) > 0) start--;
  let end = caret;
  while (end < mf.lastOffset && depthAtOffset(mf, end) > 0) end++;
  return mf.getValue(start, end, 'latex').includes('\\begin{');
}

export function installMatrixKeys(
  mf: MathfieldElement,
  onChange: (message: string) => void,
): void {
  mf.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !event.ctrlKey) return;
      if (mf.mode !== 'math') return;
      if (!caretInArray(mf)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Announce only when the grid actually changed: the caret can sit in a
      // nested structure whose top-level span contains an array without the
      // caret being IN that array, in which case the command is a no-op.
      const before = mf.getValue('latex');
      if (event.shiftKey) {
        mf.executeCommand('addColumnAfter');
        if (mf.getValue('latex') !== before) onChange('Added a column');
      } else {
        mf.executeCommand('addRowAfter');
        if (mf.getValue('latex') !== before) onChange('Added a row');
      }
    },
    true,
  );
}
