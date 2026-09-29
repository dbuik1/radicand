import { insertTemplate, latex, position, assertEqual, assertMatch } from '../helpers.mjs';

export async function arrowsJumpToLimitsFromIntegrand(page) {
  await insertTemplate(page, '\\int_{#?}^{#?}');
  // Fill both limits: top is focused first, Tab reaches the bottom.
  await page.keyboard.type('9');
  await page.keyboard.press('Tab');
  await page.keyboard.type('0');
  await page.keyboard.press('Tab'); // caret now at the integrand position
  await page.waitForTimeout(30);
  assertEqual(await latex(page), '\\int_0^9', 'filled integral');
  const posBefore = await page.evaluate(() => window.__mf.position);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(30);
  const selAfterUp = await page.evaluate(() => JSON.stringify(window.__mf.selection.ranges));
  if (selAfterUp === JSON.stringify([[posBefore, posBefore]])) {
    throw new Error('ArrowUp did not move into the top limit');
  }
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(30);
  // No assertion on exact offsets – just verify no crash and field intact.
  assertEqual(await latex(page), '\\int_0^9', 'value unchanged by navigation');
}

export async function fractionKeepsNativeUpDown(page) {
  await insertTemplate(page, '\\frac{#?}{#?}');
  const before = await page.evaluate(() => JSON.stringify(window.__mf.selection.ranges));
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(30);
  const after = await page.evaluate(() => JSON.stringify(window.__mf.selection.ranges));
  if (before === after) throw new Error('ArrowDown did not move to the denominator');
}

/** ArrowDown from the integrand reaches the bottom limit that already exists. */
export async function arrowDownFromIntegrandReachesTheBottomLimit(page) {
  await insertTemplate(page, '\\int_{#?}^{#?}');
  await page.keyboard.type('9');
  await page.keyboard.press('Tab');
  await page.keyboard.type('0');
  await page.keyboard.press('Tab'); // caret now at the integrand position
  await page.waitForTimeout(30);
  assertEqual(await latex(page), '\\int_0^9', 'filled integral');
  const before = await page.evaluate(() => JSON.stringify(window.__mf.selection.ranges));
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(30);
  const after = await page.evaluate(() => JSON.stringify(window.__mf.selection.ranges));
  if (after === before) throw new Error('ArrowDown did not move into the bottom limit');
  // The jump selects the limit's content, so typing replaces the 0.
  await page.keyboard.type('k');
  await page.waitForTimeout(40);
  assertMatch(await latex(page), /^\\int_\{?k\}?\^9$/, 'typing after ArrowDown lands in the bottom limit');
}

/** An arrow towards a limit the operator does not have leaves the equation alone. */
export async function arrowUpBesideLimWithNoTopLimitChangesNothing(page) {
  await insertTemplate(page, '\\lim_{#?}');
  await page.keyboard.type('x');
  await page.keyboard.press('Tab'); // out of the limit, to the operand position
  await page.waitForTimeout(30);
  const filled = await latex(page);
  assertMatch(filled, /^\\lim_\{?x\}?$/, 'filled lim');
  const posBefore = await position(page);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(30);
  assertEqual(await latex(page), filled, 'ArrowUp beside \\lim must not create a top limit');
  assertEqual(await position(page), posBefore, 'ArrowUp beside \\lim leaves the caret where it was');
}
