import { insertTemplate, backspace, latex, position } from '../helpers.mjs';

const PH = '\\placeholder{}';

/** Backspace from the integrand must clear the whole operator in order. */
export async function integralClearsFullyFromIntegrand(page) {
  await insertTemplate(page, '\\int_{#?}^{#?}');
  await page.evaluate(() => { window.__mf.position = window.__mf.lastOffset; });
  const expected = [
    `\\int_{${PH}}^{${PH}}`, // bs1: caret steps into the limits, no deletion
    `\\int_{}^{${PH}}`,      // bs2: lower placeholder deleted
    `\\int^{${PH}}`,          // bs3: empty lower script removed
    `\\int^{}`,               // bs4: upper placeholder deleted
    '\\int',                  // bs5: empty upper script removed (caret repaired to the operator's right)
    '',                       // bs6: bare operator deleted
  ];
  for (let i = 0; i < expected.length; i++) {
    await backspace(page);
    const value = await latex(page);
    if (value !== expected[i]) {
      throw new Error(`press ${i + 1}: expected ${JSON.stringify(expected[i])}, got ${JSON.stringify(value)}`);
    }
  }
}

export async function iintClearsFullyFromIntegrand(page) {
  await insertTemplate(page, '\\iint_{#?}^{#?}');
  await page.evaluate(() => { window.__mf.position = window.__mf.lastOffset; });
  let previous = await latex(page);
  let prevPos = await position(page);
  for (let i = 0; i < 10; i++) {
    await backspace(page);
    const value = await latex(page);
    const pos = await position(page);
    if (value === '') return;
    if (value === previous && pos === prevPos) {
      throw new Error(`stuck at ${JSON.stringify(value)} after ${i + 1} presses`);
    }
    previous = value; prevPos = pos;
  }
  throw new Error('iint did not clear within 10 presses');
}

export async function surroundingContentSurvivesUntilOperatorGone(page) {
  await page.evaluate(() => {
    const mf = window.__mf;
    mf.setValue('x+');
    mf.focus();
    mf.position = mf.lastOffset;
    window.__editor.insert('\\int_{#?}^{#?}');
    mf.position = mf.lastOffset;
  });
  await page.waitForTimeout(40);
  // Delete everything; the CRITICAL assertion is that '+' and 'x' are only
  // deleted AFTER the integral is fully gone (previously \int was skipped).
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await backspace(page);
    const value = await latex(page);
    seen.push(value);
    if (value === '') break;
  }
  const first = seen.findIndex((v) => !v.includes('\\int'));
  if (first === -1) throw new Error(`integral never deleted: ${JSON.stringify(seen)}`);
  if (seen[first] !== 'x+') {
    throw new Error(`expected 'x+' to survive until the integral was gone, got ${JSON.stringify(seen)}`);
  }
  if (seen[seen.length - 1] !== '') throw new Error(`did not fully clear: ${JSON.stringify(seen)}`);
}

/** Guard: deleting a plain char left of a PRE-EXISTING bare operator must not jump the caret. */
export async function caretDoesNotJumpWhenDeletingLeftOfBareOperator(page) {
  await page.evaluate(() => {
    const mf = window.__mf;
    mf.setValue('x\\int');
    mf.focus();
    mf.position = 1; // caret between x and \int, at top level
  });
  await page.waitForTimeout(30);
  await backspace(page); // deletes the x
  const value = await latex(page);
  const pos = await position(page);
  if (value !== '\\int') throw new Error(`expected \\int to remain, got ${JSON.stringify(value)}`);
  if (pos !== 0) throw new Error(`caret must stay left of the operator (pos 0), got ${pos}`);
}
