import { latex, assertMatch } from '../helpers.mjs';

/**
 * MathLive gives atoms inside an accent's vertical list no hit-test bounds, so
 * clicks cannot land in an accent's body natively; the editor redirects a
 * click beside an accent skeleton onto its placeholder (navigation.ts).
 */
async function clickIntoAccent(page, template, command) {
  await page.evaluate((t) => {
    window.__mf.setValue('');
    window.__mf.focus();
    window.__editor.insert(t);
  }, template);
  await page.waitForTimeout(50);
  // Deselect the placeholder, as a user who clicked elsewhere would have.
  await page.keyboard.press('End');
  await page.waitForTimeout(30);
  // Click on the accent atom (the whole structure's bounds – interior atoms
  // expose none).
  const box = await page.evaluate(() => {
    const mf = window.__mf;
    const b = mf.getElementInfo(mf.lastOffset)?.bounds;
    const host = mf.getBoundingClientRect();
    return b ? { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, hx: host.x, hy: host.y } : null;
  });
  if (!box) throw new Error(`no bounds for ${command} atom`);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(60);
  await page.keyboard.press('k');
  await page.waitForTimeout(40);
  const value = await latex(page);
  assertMatch(
    value,
    new RegExp(`\\\\${command}\\{k\\}`),
    `typing after clicking the ${command} skeleton fills its placeholder`,
  );
}

export async function clickIntoHatPlaceholderTypes(page) {
  await clickIntoAccent(page, '\\hat{#?}', 'hat');
}

export async function clickIntoVecPlaceholderTypes(page) {
  await clickIntoAccent(page, '\\vec{#?}', 'vec');
}

// \overline renders as a rule, not an accent vlist, so its placeholder is
// natively clickable – this guards that MathLive path (and that the accent
// redirect leaves it alone).
export async function clickIntoOverlinePlaceholderTypes(page) {
  await page.evaluate(() => {
    window.__mf.setValue('');
    window.__mf.focus();
    window.__editor.insert('\\overline{#?}');
  });
  await page.waitForTimeout(50);
  await page.keyboard.press('End');
  await page.waitForTimeout(30);
  const box = await page.evaluate(() => {
    const b = window.__mf.getElementInfo(2)?.bounds; // the placeholder atom
    return b ? { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 } : null;
  });
  if (!box) throw new Error('no bounds for the overline placeholder');
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(60);
  await page.keyboard.press('k');
  await page.waitForTimeout(40);
  assertMatch(await latex(page), /\\overline\{k\}/, 'typing after clicking the overline placeholder fills it');
}
