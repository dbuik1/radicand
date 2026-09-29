import { insertTemplate, backspace, latex, assertEqual, fieldTakesKeys } from '../helpers.mjs';

const PH = '\\placeholder{}';

/**
 * After inserting an integral template and peeling one limit with Backspace,
 * Ctrl+Z restores the full template with both limits.
 */
export async function undoRestoresPeeledLimit(page) {
  await insertTemplate(page, '\\int_{#?}^{#?}');
  assertEqual(await latex(page), `\\int_{${PH}}^{${PH}}`, 'after insert');
  await backspace(page);
  assertEqual(await latex(page), `\\int_{${PH}}`, 'after backspace (peel)');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(50);
  assertEqual(await latex(page), `\\int_{${PH}}^{${PH}}`, 'after Ctrl+Z restores full template');
}

/**
 * After typing \sum and letting it auto-box into a structure with placeholders,
 * Ctrl+Z restores the bare typed command: auto-boxing must apply the template
 * through a selection-based `insert`, which leaves the undo history intact,
 * rather than a history-destroying `setValue`.
 */
export async function undoAfterAutoBoxRestoresTypedCommand(page) {
  // Type \sum by hand, pausing between keystrokes so auto-boxing can run.
  await page.evaluate(() => { window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(30);
  await page.keyboard.press('s');
  await page.waitForTimeout(30);
  await page.keyboard.press('u');
  await page.waitForTimeout(30);
  await page.keyboard.press('m');
  await page.waitForTimeout(400); // wait for auto-boxing to complete
  assertEqual(
    await latex(page),
    `\\sum_{${PH}}^{${PH}}`,
    'after typing \\sum and auto-boxing',
  );
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(50);
  assertEqual(await latex(page), '\\sum', 'after Ctrl+Z restores bare \\sum');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(50);
  assertEqual(await latex(page), '', 'after second Ctrl+Z empties field');
}

/** A command confirmed by Space boxes too, and one Ctrl+Z removes the box. */
export async function undoAfterConfirmedAutoBoxLeavesNoPlaceholders(page) {
  await page.evaluate(() => { window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.keyboard.type('\\int', { delay: 30 });
  await page.keyboard.press('Space'); // \int is a prefix of \intercal: it waits for a confirm key
  await page.waitForTimeout(400);
  assertEqual(await latex(page), `\\int_{${PH}}^{${PH}}`, 'after typing \\int and confirming');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(50);
  assertEqual((await latex(page)).includes('placeholder'), false, 'Ctrl+Z removes the boxed limits');
}

/**
 * After typing into a matrix cell, Ctrl+Z removes the typed character(s).
 */
export async function undoAfterMatrixTyping(page) {
  await insertTemplate(page, '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}');
  assertEqual(
    await latex(page),
    '\\begin{pmatrix}' + PH + ' & ' + PH + '\\\\ ' + PH + ' & ' + PH + '\\end{pmatrix}',
    'after insert',
  );
  await page.keyboard.type('1');
  await page.waitForTimeout(30);
  const withOne = await latex(page);
  if (!withOne.includes('1')) {
    throw new Error(`expected '1' in matrix, got: ${JSON.stringify(withOne)}`);
  }
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(50);
  const afterUndo = await latex(page);
  if (afterUndo.includes('1')) {
    throw new Error(`'1' should be undone, got: ${JSON.stringify(afterUndo)}`);
  }
  if (!afterUndo.includes('\\begin{pmatrix}') || !afterUndo.includes('\\end{pmatrix}')) {
    throw new Error(`matrix structure corrupted after undo, got: ${JSON.stringify(afterUndo)}`);
  }
}
