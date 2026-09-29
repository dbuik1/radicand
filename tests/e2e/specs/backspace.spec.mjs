import { insertTemplate, backspace, latex, assertEqual } from '../helpers.mjs';

const PH = '\\placeholder{}';

export async function integralPeelsOneLimitPerPress(page) {
  await insertTemplate(page, '\\int_{#?}^{#?}');
  assertEqual(await latex(page), `\\int_{${PH}}^{${PH}}`, 'after insert');
  await backspace(page);
  assertEqual(await latex(page), `\\int_{${PH}}`, 'bs1 peels focused (top) limit');
  await backspace(page);
  assertEqual(await latex(page), '\\int', 'bs2 peels bottom limit');
  await backspace(page);
  assertEqual(await latex(page), '', 'bs3 removes bare operator');
}

export async function sumPeelsLikeIntegral(page) {
  await insertTemplate(page, '\\sum_{#?}^{#?}');
  await backspace(page);
  assertEqual(await latex(page), `\\sum_{${PH}}`, 'sum bs1');
  await backspace(page);
  assertEqual(await latex(page), '\\sum', 'sum bs2');
  await backspace(page);
  assertEqual(await latex(page), '', 'sum bs3');
}

export async function fractionAndRootDeleteWhole(page) {
  await insertTemplate(page, '\\frac{#?}{#?}');
  await backspace(page);
  assertEqual(await latex(page), '', 'empty fraction deletes whole');
  await insertTemplate(page, '\\sqrt{#?}');
  await backspace(page);
  assertEqual(await latex(page), '', 'empty sqrt deletes whole');
}

export async function integralWithSurroundingContentDeletesInOrder(page) {
  await page.evaluate(() => {
    const mf = window.__mf;
    mf.setValue('x+');
    mf.focus();
    mf.position = mf.lastOffset;
    window.__editor.insert('\\int_{#?}^{#?}');
  });
  await page.waitForTimeout(40);
  await backspace(page);
  assertEqual(await latex(page), `x+\\int_{${PH}}`, 'x+int bs1');
  await backspace(page);
  assertEqual(await latex(page), 'x+\\int', 'x+int bs2');
  await backspace(page);
  assertEqual(await latex(page), 'x+', 'x+int bs3 removes operator, not the +');
  await backspace(page);
  assertEqual(await latex(page), 'x', 'x+int bs4');
  await backspace(page);
  assertEqual(await latex(page), '', 'x+int bs5');
}

export async function filledStructuresArePreserved(page) {
  await insertTemplate(page, '\\frac{#?}{#?}');
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await page.waitForTimeout(30);
  assertEqual(await latex(page), '\\frac12', 'filled fraction');
  await backspace(page);
  assertEqual(await latex(page), '\\frac{1}{}', 'bs trims denominator only');
}
