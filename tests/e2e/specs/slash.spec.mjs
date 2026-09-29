import { latex, assertMatch, fieldTakesKeys } from '../helpers.mjs';

export async function slashBuildsFractionByDefault(page) {
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.keyboard.type('1/2');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /\\frac\{?1\}?\{?2\}?/, 'typing 1/2 builds a fraction by default');
}

export async function slashTypesPlainSlashWhenDisabled(page) {
  await page.evaluate(() => window.__updateSettings({ slashFraction: false }));
  await page.waitForTimeout(50);
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.keyboard.type('1/2');
  await page.waitForTimeout(150);
  const value = await latex(page);
  if (/\\frac/.test(value)) throw new Error(`expected literal slash, got ${JSON.stringify(value)}`);
  assertMatch(value, /1\\?\/2/, 'typing 1/2 stays literal when the setting is off');
}
