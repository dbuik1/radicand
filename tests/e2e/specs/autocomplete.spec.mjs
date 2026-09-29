import { latex, settled, assertEqual, assertMatch, insertTemplate, fieldTakesKeys } from '../helpers.mjs';

async function typeCommand(page, letters) {
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(30);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(25);
  for (const ch of letters) {
    await page.keyboard.press(ch);
    await page.waitForTimeout(25);
  }
}

/** Type a command, then wait for the auto-accept and boxing to produce `expected`. */
async function typedAndBoxed(page, letters, expected, label) {
  await typeCommand(page, letters);
  const value = await settled(page, expected);
  if (expected instanceof RegExp) assertMatch(value, expected, label);
  else assertEqual(value, expected, label);
}

export async function typedSumGetsPlaceholdersAtDefaultDelay(page) {
  await typedAndBoxed(page, 'sum', /\\sum_\{\\placeholder\{\}\}\^\{\\placeholder\{\}\}/, 'typed \\sum boxed');
}

/** \int is a prefix of \intercal, so it boxes once a confirm key is pressed. */
export async function typedIntBoxesOnConfirm(page) {
  await typeCommand(page, 'int');
  await page.waitForTimeout(400);
  assertEqual(await page.evaluate(() => window.__mf.mode), 'latex', '\\int waits for a confirm key');
  await page.keyboard.press('Space');
  const boxed = /\\int_\{\\placeholder\{\}\}\^\{\\placeholder\{\}\}/;
  assertMatch(await settled(page, boxed), boxed, '\\int + space boxes');
}

export async function typedSqrtAndFracGetPlaceholdersAtZeroDelay(page) {
  await page.evaluate(() => window.__updateSettings({ commandDelay: 0 }));
  await typedAndBoxed(page, 'sqrt', /\\sqrt\{\\placeholder\{\}\}/, 'zero-delay \\sqrt boxed');
  await typedAndBoxed(page, 'frac', /\\frac\{\\placeholder\{\}\}\{\\placeholder\{\}\}/, 'zero-delay \\frac boxed');
}

/**
 * Regression: a brace-argument command typed into a fraction's numerator must
 * be boxed *in place*. MathLive's accept-all commits e.g. `\sqrt` as a
 * `\sqrt{}` atom whose empty radicand group occupies the offset just before
 * the atom's own; the nested boxing branch used to select the naive
 * `[pos - 1, pos]` range, which cut into the atom's interior – and replacing
 * that mangled selection deleted the numerator's content and dropped the
 * fresh `\sqrt{\placeholder{}}` into the denominator instead.
 */
export async function typedSqrtInNumeratorStaysInNumerator(page) {
  // (a) numerator placeholder of a palette-inserted fraction.
  await insertTemplate(page, '\\frac{#?}{#?}');
  await typedHereAndBoxed(
    page,
    'sqrt',
    '\\frac{\\sqrt{\\placeholder{}}}{\\placeholder{}}',
    '\\sqrt typed in the numerator boxes in the numerator',
  );

  // (b) numerator that already has content before the command.
  await insertTemplate(page, '\\frac{#?}{#?}');
  await page.keyboard.press('x');
  await page.waitForTimeout(40);
  await typedHereAndBoxed(
    page,
    'sqrt',
    '\\frac{x\\sqrt{\\placeholder{}}}{\\placeholder{}}',
    '\\sqrt typed after content keeps that content and boxes in place',
  );

  // (c) denominator placeholder – the same nested-boxing path.
  await insertTemplate(page, '\\frac{#?}{#?}');
  await page.keyboard.press('Tab'); // move to the denominator placeholder
  await page.waitForTimeout(40);
  await typedHereAndBoxed(
    page,
    'sqrt',
    '\\frac{\\placeholder{}}{\\sqrt{\\placeholder{}}}',
    '\\sqrt typed in the denominator boxes in the denominator',
  );

  // (d) the other single-brace-argument commands share the committed
  // `\cmd{}` shape, so spot-check one accent too.
  await insertTemplate(page, '\\frac{#?}{#?}');
  await typedHereAndBoxed(
    page,
    'vec',
    '\\frac{\\vec{\\placeholder{}}}{\\placeholder{}}',
    '\\vec typed in the numerator boxes in the numerator',
  );
}

/** Type `\` then `letters` at the current caret, and wait for the boxed `expected`. */
async function typedHereAndBoxed(page, letters, expected, label) {
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(25);
  for (const ch of letters) {
    await page.keyboard.press(ch);
    await page.waitForTimeout(25);
  }
  assertEqual(await settled(page, expected), expected, label);
}

/**
 * Regression for a spurious nested fraction: with a high `commandDelay`, the
 * auto-accept timer set while typing `\frac` and the `input`-driven boxing
 * debounce both can fire *after* the command has already been completed
 * (Enter, Space, or MathLive's own accept-all) – and MathLive's own completion
 * path already fully builds `\frac{\placeholder{}}{\placeholder{}}` internally
 * even though `getValue('latex')` transiently reports the bare `\frac` (an
 * all-placeholder trailing atom collapses in that document-level round-trip).
 * Boxing again used to select just the denominator's placeholder atom and
 * replace it with a fresh template, nesting a second fraction inside it. In
 * every completion path the final value must be exactly one flat fraction.
 */
export async function typedFracNeverNestsRegardlessOfCompletionPath(page) {
  await page.evaluate(() => window.__updateSettings({ commandDelay: 400 }));
  const exactlyOneFlatFrac = /^\\frac\{\\placeholder\{\}\}\{\\placeholder\{\}\}$/;
  // The value must hold once every timer has fired, not only when it first
  // appears: wait for it, then outwait the auto-accept and boxing timers
  // (two of commandDelay each) before reading it again.
  const afterEveryTimer = async (expected) => {
    await settled(page, expected);
    await page.waitForTimeout(900);
    return latex(page);
  };

  // (a) type `\frac` and wait past the delay with no explicit completion key.
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(20);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(15);
  for (const ch of 'frac') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(15);
  }
  assertMatch(await afterEveryTimer(exactlyOneFlatFrac), exactlyOneFlatFrac, '(a) wait-only: exactly one flat frac');

  // (b) type `\frac` then press Enter immediately, then wait past the delay.
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(20);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(15);
  for (const ch of 'frac') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(15);
  }
  await page.keyboard.press('Enter');
  assertMatch(await afterEveryTimer(exactlyOneFlatFrac), exactlyOneFlatFrac, '(b) Enter immediately: exactly one flat frac');

  // (c) type `\frac` then press Space immediately, then wait past the delay.
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(20);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(15);
  for (const ch of 'frac') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(15);
  }
  await page.keyboard.press('Space');
  assertMatch(await afterEveryTimer(exactlyOneFlatFrac), exactlyOneFlatFrac, '(c) Space immediately: exactly one flat frac');

  // Still box \sqrt and \sum correctly at this same (high) delay.
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(20);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(15);
  for (const ch of 'sqrt') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(15);
  }
  assertEqual(await afterEveryTimer('\\sqrt{\\placeholder{}}'), '\\sqrt{\\placeholder{}}', '\\sqrt still boxes cleanly');

  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(20);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(15);
  for (const ch of 'sum') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(15);
  }
  assertEqual(
    await afterEveryTimer('\\sum_{\\placeholder{}}^{\\placeholder{}}'),
    '\\sum_{\\placeholder{}}^{\\placeholder{}}',
    '\\sum still boxes cleanly',
  );

  // Typing `\frac{1}{2}` raw (braces right after the command) must still work.
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(20);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(15);
  for (const ch of 'frac') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(15);
  }
  await page.keyboard.press('Shift+BracketLeft');
  await page.waitForTimeout(15);
  await page.keyboard.press('1');
  await page.waitForTimeout(15);
  await page.keyboard.press('Shift+BracketRight');
  await page.waitForTimeout(15);
  await page.keyboard.press('Shift+BracketLeft');
  await page.waitForTimeout(15);
  await page.keyboard.press('2');
  await page.waitForTimeout(15);
  await page.keyboard.press('Shift+BracketRight');
  assertEqual(await afterEveryTimer('\\frac{1}{2}'), '\\frac{1}{2}', 'manual \\frac{1}{2} still works raw');
}

/**
 * Regression: deleting back to a complete command (`\sqrtt`, Backspace)
 * must pick the command up again and complete it on its own, as typing it
 * straight would.
 */
export async function aCommandCorrectedWithBackspaceStillCompletes(page) {
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(30);
  await page.keyboard.type('\\sqrtt', { delay: 30 });
  await page.keyboard.press('Backspace');
  const value = await settled(page, /\\sqrt\{\\placeholder\{\}\}/);
  assertMatch(value, /\\sqrt\{\\placeholder\{\}\}/, '\\sqrtt then Backspace completes \\sqrt');
}

/** Deleting back past a command's end must not complete a shorter one. */
export async function deletingIntoAnAmbiguousPrefixDoesNotComplete(page) {
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(30);
  await page.keyboard.type('\\intx', { delay: 30 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1200);
  assertEqual(await latex(page), '', '\\in is a prefix of \\int and \\infty, so it waits');
}

/** Type `\` then `letters` one key at a time, slower than the default command delay. */
async function typeSlowly(page, letters, keyDelay = 160) {
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.waitForTimeout(30);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(keyDelay);
  for (const ch of letters) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(keyDelay);
  }
}

/**
 * Regression: a command that longer commands start with must never complete
 * by itself. `\le` used to become ≤ the moment the default delay elapsed,
 * hijacking `\leq`, `\left` and `\leftarrow` typed at a human pace.
 */
export async function slowlyTypedLeqIsNotHijackedByLe(page) {
  await typeSlowly(page, 'leq');
  await page.keyboard.press('Space');
  assertEqual(await settled(page, '\\leq'), '\\leq', '\\leq typed slowly stays \\leq');
}

export async function slowlyTypedLeftArrowIsNotHijackedByLe(page) {
  await typeSlowly(page, 'leftarrow');
  await page.keyboard.press('Space');
  assertEqual(await settled(page, '\\leftarrow'), '\\leftarrow', '\\leftarrow typed slowly stays \\leftarrow');
}

export async function slowlyTypedSinhIsNotHijackedBySin(page) {
  await typeSlowly(page, 'sinh');
  await page.keyboard.press('Space');
  assertEqual(await settled(page, '\\sinh'), '\\sinh', '\\sinh typed slowly stays \\sinh');
}

export async function slowlyTypedLeftParenthesisKeepsRawEditing(page) {
  await typeSlowly(page, 'left');
  await page.waitForTimeout(400);
  assertEqual(await page.evaluate(() => window.__mf.mode), 'latex', '\\left is still being typed after the delay');
  await page.keyboard.type('(');
  await page.waitForTimeout(400);
  assertEqual(await page.evaluate(() => window.__mf.mode), 'latex', '\\left( keeps raw editing');
  await page.keyboard.press('Enter');
  const value = await settled(page, /left/);
  assertMatch(value, /\\left/, '\\left( typed slowly is not turned into \\le + ft');
}

/** An ambiguous command waits for a confirm key, however long it is left. */
export async function anAmbiguousCommandWaitsForAConfirmKey(page) {
  await typeSlowly(page, 'le');
  await page.waitForTimeout(900);
  assertEqual(await page.evaluate(() => window.__mf.mode), 'latex', '\\le is still being typed after the delay');
  for (const key of ['Space', 'Tab', 'Enter']) {
    await typeSlowly(page, 'le');
    await page.keyboard.press(key);
    const value = await settled(page, /\\le\b(?!ft)/);
    assertMatch(value, /^\\le(?![a-z])/, `\\le confirmed by ${key}`);
  }
}

/** A command no longer command starts with still completes by itself. */
export async function anUnambiguousCommandStillCompletesByItself(page) {
  await typeSlowly(page, 'alpha');
  assertEqual(await settled(page, '\\alpha'), '\\alpha', '\\alpha completes on its own');
}
