import { insertTemplate, backspace, latex, assertEqual } from '../helpers.mjs';

const PH = '\\placeholder{}';

export async function backspaceFromIntegrandStepsIntoLimits(page) {
  await insertTemplate(page, '\\int_{#?}^{#?}');
  // Move the caret to the very end (the integrand position).
  await page.evaluate(() => { window.__mf.position = window.__mf.lastOffset; });
  await backspace(page);
  // Whole integral must NOT vanish; native deletion steps into the limits.
  const value = await latex(page);
  if (value === '') throw new Error('backspace from integrand deleted the whole integral');
  assertEqual(value, `\\int_{${PH}}^{${PH}}`, 'first bs only moves into limits');
}
