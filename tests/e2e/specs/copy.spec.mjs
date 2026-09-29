/**
 * Ctrl+C in the field copies what the Copy button copies in LaTeX: the
 * LaTeX itself, with no `$$` delimiters around it.
 */

import { fieldTakesKeys } from '../helpers.mjs';

/** Press Ctrl+C in the field and return the plain text it put on the clipboard. */
async function copyFromField(page, latex, selectKeys = []) {
  await page.evaluate(
    (latex) => {
      window.__copied = null;
      window.addEventListener(
        'copy',
        (event) => {
          window.__copied = event.clipboardData.getData('text/plain');
        },
        { once: true },
      );
      window.__mf.setValue(latex);
      window.__mf.focus();
    },
    latex,
  );
  await fieldTakesKeys(page);
  for (const key of selectKeys) await page.keyboard.press(key);
  await page.keyboard.press('Control+c');
  await page.waitForFunction(() => window.__copied !== null, undefined, { timeout: 2000 });
  return page.evaluate(() => window.__copied);
}

export async function ctrlCCopiesTheWholeEquationWithoutDollarSigns(page) {
  const copied = await copyFromField(page, '\\frac{a}{b}+x^2');
  if (copied !== '\\frac{a}{b}+x^2') throw new Error(`expected \\frac{a}{b}+x^2, got ${JSON.stringify(copied)}`);
}

export async function ctrlCCopiesTheSelectionWithoutDollarSigns(page) {
  // From the end, two Shift+Arrow Left select `+b`.
  const copied = await copyFromField(page, 'a+b', ['End', 'Shift+ArrowLeft', 'Shift+ArrowLeft']);
  if (copied !== '+b') throw new Error(`expected +b, got ${JSON.stringify(copied)}`);
}

/** What Ctrl+C now copies still pastes back into the field as maths. */
export async function copiedLatexPastesBackAsMaths(page) {
  const copied = await copyFromField(page, '\\frac{a}{b}+x^2');
  const latex = await page.evaluate((text) => {
    window.__mf.setValue('');
    window.__mf.focus();
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const target = window.__mf.shadowRoot.querySelector('.ML__keyboard-sink') ?? window.__mf;
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, composed: true }));
    return window.__mf.getValue('latex');
  }, copied);
  if (latex !== '\\frac{a}{b}+x^2') throw new Error(`pasting ${copied} gave ${JSON.stringify(latex)}`);
}
