import { latex, settled, assertMatch, fieldTakesKeys } from '../helpers.mjs';

/**
 * The word-processor styling model (editor/styling.ts): a typed style
 * command arms a sticky style at a collapsed caret, Ctrl+B/I toggle the
 * selection, and navigation clears a pending sticky style.
 */

async function reset(page) {
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(50);
}

/**
 * A typed style command is rejected by the auto-accept timer, which leaves
 * LaTeX mode as it arms the style – so "armed" is observable as the field
 * being back in maths mode.
 */
async function styleArmed(page) {
  await page
    .waitForFunction(() => window.__mf.mode === 'math', undefined, { timeout: 2000, polling: 25 })
    .catch(() => {});
}

export async function typedMathbfInEmptyFieldStylesFirstTyping(page) {
  await reset(page);
  await page.keyboard.type('\\mathbf');
  await page.keyboard.press('Space'); // \mathbf is a prefix of \mathbfit: it waits for a confirm key
  await styleArmed(page); // the confirm rejects the text, arms pending
  await page.keyboard.type('x'); // the pending style applies to first content
  const boldX = /\\mathbf\{?x\}?/;
  assertMatch(await settled(page, boldX), boldX, 'typed \\mathbf in an empty field styles the first typing');
}

export async function typedMathbfAfterContentArmsStickyBold(page) {
  await reset(page);
  await page.keyboard.type('a+');
  await page.waitForTimeout(100);
  await page.keyboard.type('\\mathbf');
  await page.keyboard.press('Space'); // \mathbf is a prefix of \mathbfit: it waits for a confirm key
  await styleArmed(page); // the confirm rejects the text and arms bold
  await page.keyboard.type('x');
  const boldAfterContent = /a\+\\mathbf\{?x\}?/;
  assertMatch(await settled(page, boldAfterContent), boldAfterContent, 'typed \\mathbf arms bold for the next character');
}

export async function typedMathcalArmsScriptVariant(page) {
  await reset(page);
  await page.keyboard.type('\\mathcal');
  await styleArmed(page);
  await page.keyboard.type('L');
  // Calligraphic routes through the script variant so the MathML export
  // keeps the style (see mathml-export.test.ts).
  const scriptL = /\\mathscr\{?L\}?/;
  assertMatch(await settled(page, scriptL), scriptL, 'typed \\mathcal produces the script variant');
}

export async function shortcutTogglesBoldOnSelection(page) {
  await reset(page);
  await page.keyboard.type('abc');
  await page.waitForTimeout(150);
  await page.keyboard.press('Shift+ArrowLeft'); // select the c
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /\\mathbf\{?c\}?/, 'Ctrl+B bolds the selection');
  // Toggle back off with the selection still active.
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(150);
  const value = await latex(page);
  if (/\\mathbf/.test(value)) {
    throw new Error(`expected Ctrl+B to toggle bold off, got ${JSON.stringify(value)}`);
  }
}

export async function navigationClearsPendingStickyStyle(page) {
  await reset(page);
  await page.keyboard.type('ab');
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+b'); // arm sticky bold at the caret
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowLeft'); // navigation clears the pending style
  await page.keyboard.type('y');
  await page.waitForTimeout(150);
  const value = await latex(page);
  if (/\\mathbf/.test(value)) {
    throw new Error(`expected navigation to clear pending bold, got ${JSON.stringify(value)}`);
  }
}

export async function mixedSelectionStillToggles(page) {
  await reset(page);
  await page.keyboard.type('ab');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+b'); // b is now bold
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.__mf.select(); // whole field: a plain, b bold – a mixed selection
  });
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /\\mathbf\{?ab\}?/, 'toggling a mixed selection makes it uniformly bold');
}
