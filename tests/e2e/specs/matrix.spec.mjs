import { insertTemplate, backspace, latex, assertEqual, assertMatch } from '../helpers.mjs';

const MATRIX = '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}';

export async function singleCellBackspaceDoesNotDeleteMatrix(page) {
  await insertTemplate(page, MATRIX);
  await backspace(page);
  const value = await latex(page);
  if (value === '') throw new Error('one backspace deleted the whole matrix');
  assertMatch(value, /begin\{pmatrix\}/, 'matrix still present after one backspace');
}

export async function partiallyFilledMatrixFullyClearsWithoutSticking(page) {
  await insertTemplate(page, MATRIX);
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  // Backspace repeatedly; the field MUST reach empty, and no press before that
  // may be a complete no-op (value AND caret unchanged) – that would be the
  // "stuck in a matrix" dead end this suite exists to prevent.
  let previous = await latex(page);
  let prevPos = await page.evaluate(() => window.__mf.position);
  for (let i = 0; i < 25; i++) {
    await backspace(page);
    const current = await latex(page);
    const pos = await page.evaluate(() => window.__mf.position);
    if (current === '') return; // fully cleared: success
    if (current === previous && pos === prevPos) {
      throw new Error(`stuck at ${JSON.stringify(current)} after ${i + 1} presses`);
    }
    previous = current;
    prevPos = pos;
  }
  throw new Error('matrix did not fully clear within 25 backspaces');
}

export async function backspaceInFilledCellDeletesOneCharOnly(page) {
  await insertTemplate(page, MATRIX);
  await page.keyboard.type('12');
  await page.waitForTimeout(30);
  await backspace(page);
  const value = await latex(page);
  assertMatch(value, /begin\{pmatrix\}/, 'matrix still present');
  assertMatch(value, /1\s*&/, 'cell reduced to "1", not wiped');
}

/**
 * Regression for a reported data-loss bug: a collapsed caret sitting
 * immediately OUTSIDE a complete array – e.g. after pressing ArrowRight out of
 * the last (still placeholder-selected) cell, which is exactly where Tab
 * naturally leaves you – hands Backspace to MathLive's native `deleteBackward`
 * at the array's own top-level boundary. From there MathLive treats the whole
 * array as a single atom and deletes it wholesale in one press, silently
 * losing every cell's content regardless of how much was filled in. Backspace
 * from just outside the matrix must instead step back inside (a navigation
 * move), never delete the structure outright while it still holds content.
 */
export async function backspaceJustOutsideMatrixNeverDeletesFilledContent(page) {
  await insertTemplate(page, MATRIX);
  await page.keyboard.type('1'); // cell 1 = "1"
  await page.keyboard.press('Tab'); // -> cell 2 (placeholder, selected)
  await page.keyboard.press('Tab'); // -> cell 3 (placeholder, selected)
  await page.keyboard.press('Tab'); // -> cell 4 (placeholder, selected)
  await page.waitForTimeout(30);
  await page.keyboard.press('ArrowRight'); // collapse out past the last cell
  await page.waitForTimeout(30);
  await backspace(page);
  const value = await latex(page);
  if (value === '') throw new Error('Backspace just outside the matrix deleted it, losing cell 1\'s "1"');
  assertMatch(value, /begin\{pmatrix\}/, 'matrix still present');
  assertMatch(value, /1\s*&/, 'filled cell 1 survived');
}

export async function filledCellsPreserved(page) {
  await insertTemplate(page, MATRIX);
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await page.waitForTimeout(30);
  assertMatch(await latex(page), /1 & 2/, 'cells contain typed values');
}

export async function ctrlEnterAddsRow(page) {
  await insertTemplate(page, '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}');
  await page.keyboard.type('1'); // caret is in cell 1
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(60);
  const value = await latex(page);
  const rowBreaks = (value.match(/\\\\/g) ?? []).length;
  if (rowBreaks !== 2) throw new Error(`expected 3 rows (2 breaks), got ${rowBreaks}: ${value}`);
}

export async function ctrlShiftEnterAddsColumn(page) {
  await insertTemplate(page, '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}');
  await page.keyboard.type('1');
  await page.keyboard.press('Control+Shift+Enter');
  await page.waitForTimeout(60);
  const value = await latex(page);
  const firstRow = value.split('\\\\')[0];
  const cols = (firstRow.match(/&/g) ?? []).length + 1;
  if (cols !== 3) throw new Error(`expected 3 columns, got ${cols}: ${value}`);
}

export async function emptyCellBackspaceNavigatesToPreviousCell(page) {
  await insertTemplate(page, MATRIX);
  // Tab to the last cell, whose placeholder is selected; first press clears it.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.waitForTimeout(30);
  await backspace(page);
  assertMatch(await latex(page), /begin\{pmatrix\}/, 'matrix intact after clearing last cell');
  // The next press, in the now-empty cell, must NAVIGATE (previous cell), not
  // delete the whole matrix.
  const posBefore = await page.evaluate(() => window.__mf.position);
  await backspace(page);
  const value = await latex(page);
  assertMatch(value, /begin\{pmatrix\}/, 'matrix survives backspace in an empty cell');
  const posAfter = await page.evaluate(() => window.__mf.position);
  if (posAfter >= posBefore) {
    throw new Error(`expected caret to move to previous cell (pos ${posBefore} -> ${posAfter})`);
  }
}

export async function nestedIntegralPeelsInsideMatrixCell(page) {
  await insertTemplate(page, MATRIX);
  await page.keyboard.type('7'); // fill cell 1 so the matrix is not all-empty
  await page.keyboard.press('Tab');
  await page.waitForTimeout(30);
  await page.evaluate(() => { window.__editor.insert('\\int_{#?}^{#?}'); });
  await page.waitForTimeout(50);
  // Backspaces must peel the integral limit-by-limit and then remove the bare
  // operator, leaving the matrix and the filled cell intact throughout.
  let sawIntGone = false;
  let previous = await latex(page);
  let prevPos = await page.evaluate(() => window.__mf.position);
  for (let i = 0; i < 8; i++) {
    await backspace(page);
    const value = await latex(page);
    const pos = await page.evaluate(() => window.__mf.position);
    assertMatch(value, /begin\{pmatrix\}/, `matrix intact after press ${i + 1}`);
    assertMatch(value, /7/, `filled cell intact after press ${i + 1}`);
    if (value === previous && pos === prevPos) {
      throw new Error(`stuck at ${JSON.stringify(value)} after ${i + 1} presses`);
    }
    previous = value;
    prevPos = pos;
    if (!value.includes('\\int')) { sawIntGone = true; break; }
  }
  if (!sawIntGone) throw new Error(`integral not fully deleted: ${previous}`);
}

export async function allEmptyMatrixClearsCellByCellFromLastCell(page) {
  await insertTemplate(page, MATRIX);
  // From the LAST cell, deletion must walk the grid cell by cell (clearing a
  // placeholder, then navigating) and only remove the matrix once the caret
  // has worked its way to the first position – never wholesale from a later
  // cell, which was the reported bug.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.waitForTimeout(30);
  let previous = await latex(page);
  let prevPos = await page.evaluate(() => window.__mf.position);
  for (let i = 0; i < 25; i++) {
    await backspace(page);
    const value = await latex(page);
    const pos = await page.evaluate(() => window.__mf.position);
    if (value === '') {
      if (i < 4) throw new Error(`whole matrix deleted after only ${i + 1} presses from the last cell`);
      return; // fully cleared after a cell-by-cell walk: success
    }
    if (value === previous && pos === prevPos) {
      throw new Error(`stuck at ${JSON.stringify(value)} after ${i + 1} presses`);
    }
    previous = value;
    prevPos = pos;
  }
  throw new Error('matrix did not fully clear within 25 backspaces');
}

export async function typedIntInsideCellGetsLimits(page) {
  await insertTemplate(page, MATRIX);
  await page.keyboard.type('\\int', { delay: 30 });
  await page.keyboard.press('Space'); // \int is a prefix of \intercal: it waits for a confirm key
  await page.waitForTimeout(400);
  const value = await latex(page);
  assertMatch(value, /begin\{pmatrix\}/, 'matrix intact');
  assertMatch(
    value,
    /\\int_\{\\placeholder\{\}\}\^\{\\placeholder\{\}\}/,
    'typed \\int inside a cell is boxed with its limit placeholders',
  );
  // And the limits must be usable: type into the selected top limit.
  await page.keyboard.type('1');
  await page.waitForTimeout(40);
  // MathLive serialises single-token arguments without braces (`^1`).
  assertMatch(await latex(page), /\\int_\{\\placeholder\{\}\}\^\{?1\}?/, 'top limit accepts typing');
}
