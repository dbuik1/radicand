import { latex, insertTemplate, assertMatch } from '../helpers.mjs';

/**
 * The expression library's load-bearing fact:
 * an equation saved with empty slots IS already a tab-navigable template.
 * `getValue('latex')` serialises unfilled placeholders back as
 * `\placeholder{}`, and re-inserting that string selects the first slot
 * with Tab moving between them – so capture needs no authoring syntax.
 */
export async function unfilledSlotsSerialiseAsPlaceholders(page) {
  await insertTemplate(page, '\\frac{#?}{#?}');
  const saved = await latex(page);
  assertMatch(
    saved,
    /\\frac\{\\placeholder\{\}\}\{\\placeholder\{\}\}/,
    'unfilled slots come back from getValue(latex) as \\placeholder{}',
  );
}

export async function partiallyFilledEquationKeepsItsEmptySlots(page) {
  await insertTemplate(page, '\\frac{#?}{#?}');
  await page.keyboard.press('a'); // fill the numerator, leave the denominator
  await page.waitForTimeout(40);
  const saved = await latex(page);
  assertMatch(
    saved,
    /\\frac\{a\}\{\\placeholder\{\}\}/,
    'a half-filled equation keeps its remaining slot as \\placeholder{}',
  );
}

export async function reinsertedSaveIsATabNavigableTemplate(page) {
  // Capture: build a two-slot template, save its LaTeX.
  await insertTemplate(page, '\\frac{#?}{#?}');
  const saved = await latex(page);
  // Re-insert the saved body into an empty field, the way the Library
  // tab's Insert does (editor.insert selects the first placeholder).
  await insertTemplate(page, saved);
  await page.keyboard.press('1'); // lands in the first slot…
  await page.waitForTimeout(40);
  await page.keyboard.press('Tab'); // …and Tab reaches the second
  await page.waitForTimeout(40);
  await page.keyboard.press('2');
  await page.waitForTimeout(40);
  // MathLive elides braces around single-token arguments (\frac12).
  assertMatch(
    await latex(page),
    /^\\frac\{?1\}?\{?2\}?$/,
    'saved template refills by typing and Tab',
  );
}
