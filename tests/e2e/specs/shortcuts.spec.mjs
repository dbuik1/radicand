import { latex, settled, assertEqual, assertMatch, fieldTakesKeys } from '../helpers.mjs';

/**
 * Custom shortcuts in the autocomplete. A shortcut is a `\`-trigger that
 * belongs to no library formula – the same confirm-to-fire lane as library
 * triggers (space, Tab or Enter; never auto-accepted), reached through the
 * composed trigger registry the panel binds. These specs pin the shortcut
 * half of that contract and the interlocks with real commands.
 */
async function typeSlashCommand(page, letters) {
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

const addShortcut = (page, shortcut) =>
  page.evaluate((s) => window.__shortcuts.addShortcut(s), shortcut);

export async function shortcutPlusSpaceInsertsLatexWithCaretInFirstSlot(page) {
  await addShortcut(page, {
    trigger: 'pd',
    latex: '\\frac{\\partial \\placeholder{}}{\\partial \\placeholder{}}',
  });
  await typeSlashCommand(page, 'pd');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertMatch(
    await latex(page),
    /^\\frac\{\\partial \\placeholder\{\}\}\{\\partial \\placeholder\{\}\}$/,
    '\\pd + space inserts the shortcut LaTeX',
  );
  // The caret sits in the first slot: type, Tab, type.
  await page.keyboard.press('f');
  await page.waitForTimeout(40);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(40);
  await page.keyboard.press('x');
  await page.waitForTimeout(40);
  assertMatch(await latex(page), /^\\frac\{\\partial f\}\{\\partial x\}$/, 'shortcut slots refill in order');
}

export async function shortcutConfirmsWithTabAndEnterToo(page) {
  await addShortcut(page, { trigger: 'RR', latex: '\\mathbb{R}' });
  await typeSlashCommand(page, 'RR');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), '\\mathbb{R}', '\\RR + Tab inserts the shortcut');
  await typeSlashCommand(page, 'RR');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), '\\mathbb{R}', '\\RR + Enter inserts the shortcut');
}

export async function shortcutNeverAutoAccepts(page) {
  await addShortcut(page, { trigger: 'waits', latex: 'w+a+i+t' });
  await page.evaluate(() => window.__updateSettings({ commandDelay: 0 }));
  await typeSlashCommand(page, 'waits');
  assertEqual(await latex(page), '', 'an unconfirmed shortcut inserts nothing');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), 'w+a+i+t', 'the pending shortcut still confirms afterwards');
}

export async function sumWaitsForConfirmBesideASumsShortcut(page) {
  await addShortcut(page, { trigger: 'sums', latex: '\\sum_{i=1}^{n}' });
  await typeSlashCommand(page, 'sum');
  await page.waitForTimeout(600);
  assertEqual(await latex(page), '', '\\sum waits while a longer shortcut starts with it');
  await page.keyboard.press(' ');
  const boxedSum = /\\sum_\{\\placeholder\{\}\}\^\{\\placeholder\{\}\}/;
  assertMatch(
    await settled(page, boxedSum),
    boxedSum,
    '\\sum + space still confirms and boxes beside a \\sums shortcut',
  );
}

export async function longerShortcutFiresPastTheAutoAcceptPrefix(page) {
  await addShortcut(page, { trigger: 'sums', latex: '\\sum_{i=1}^{n}' });
  await typeSlashCommand(page, 'sums');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), '\\sum_{i=1}^{n}', '\\sums + space inserts past the \\sum prefix');
}

export async function bmodStillConfirmsBesideShortcuts(page) {
  await addShortcut(page, { trigger: 'anything', latex: 'z' });
  await typeSlashCommand(page, 'bmod');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /\\bmod/, '\\bmod + space still commits the real command');
}

export async function unknownCommandStillCommitsAsTyped(page) {
  await addShortcut(page, { trigger: 'other', latex: 'o' });
  await typeSlashCommand(page, 'notashortcut');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /notashortcut/, 'an unknown command still commits as typed');
}

export async function undoRestoresTheTypedRun(page) {
  // One Ctrl+Z after a fired shortcut takes the insertion back in one step.
  await addShortcut(page, { trigger: 'eps', latex: '\\varepsilon' });
  await page.evaluate(() => { window.__mf.setValue('x+'); });
  await page.waitForTimeout(30);
  await page.keyboard.press('End');
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(25);
  for (const ch of 'eps') {
    await page.keyboard.press(ch);
    await page.waitForTimeout(25);
  }
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), 'x+\\varepsilon', '\\eps + space inserts after the existing text');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /^x\+/, 'Ctrl+Z removes the inserted shortcut');
  assertMatch(await latex(page), /^(?!.*varepsilon)/, 'the shortcut LaTeX is gone after undo');
}

export async function firingAnnouncesTheNameOrTriggerAndRecordsUse(page) {
  await addShortcut(page, { trigger: 'RR', latex: '\\mathbb{R}', name: 'Real numbers' });
  const bare = await addShortcut(page, { trigger: 'dx', latex: '\\,dx' });
  await typeSlashCommand(page, 'RR');
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  assertEqual(
    await page.evaluate(() => document.getElementById('sr-status')?.textContent),
    'Inserted Real numbers',
    'a named shortcut is announced by name',
  );
  await typeSlashCommand(page, 'dx');
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  assertEqual(
    await page.evaluate(() => document.getElementById('sr-status')?.textContent),
    'Inserted \\dx',
    'an unnamed shortcut is announced by trigger',
  );
  const uses = await page.evaluate(
    (id) => window.__shortcuts.getShortcuts().find((s) => s.id === id)?.uses,
    bare.id,
  );
  assertEqual(uses, 1, 'firing a shortcut records one use');
}

export async function aShortcutWinsOverALibraryTriggerWithTheSameName(page) {
  await page.evaluate(() => {
    window.__library.addLibraryEntry({ name: 'Formula', body: 'f', trigger: 'same' });
  });
  await addShortcut(page, { trigger: 'same', latex: 's' });
  await typeSlashCommand(page, 'same');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), 's', 'the shortcut answers a shared trigger');
}

/**
 * Wrapping a selection. A shortcut fired while text is selected puts the
 * selection into the template's first slot instead of replacing it.
 */
async function selectInField(page, value, from, to) {
  await page.evaluate((v) => { window.__mf.setValue(v); window.__mf.focus(); }, value);
  await fieldTakesKeys(page);
  await page.waitForTimeout(30);
  await page.evaluate(([a, b]) => { window.__mf.selection = { ranges: [[a, b]] }; }, [from, to]);
  await page.waitForTimeout(30);
}

async function typeTrigger(page, letters, confirm = ' ') {
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(25);
  for (const ch of letters) {
    await page.keyboard.press(ch);
    await page.waitForTimeout(25);
  }
  await page.keyboard.press(confirm);
  await page.waitForTimeout(150);
}

export async function shortcutWrapsTheSelectionIntoItsFirstSlot(page) {
  await addShortcut(page, { trigger: 'abs', latex: '\\left|\\placeholder{}\\right|' });
  await selectInField(page, 'a+x+b', 2, 3);
  await typeTrigger(page, 'abs');
  assertEqual(await latex(page), 'a+\\left|x\\right|+b', 'the selection fills the first slot');
  // The caret sits after the wrapper: typing continues outside it.
  await page.keyboard.press('c');
  await page.waitForTimeout(40);
  assertEqual(await latex(page), 'a+\\left|x\\right|c+b', 'the caret lands after the wrapped selection');
}

export async function wrappedSelectionKeepsLaterSlotsEmptyAndNavigable(page) {
  await addShortcut(page, {
    trigger: 'pd',
    latex: '\\frac{\\partial \\placeholder{}}{\\partial \\placeholder{}}',
  });
  await selectInField(page, 'f', 0, 1);
  await typeTrigger(page, 'pd', 'Tab');
  assertMatch(
    await latex(page),
    /^\\frac\{\\partial f\}\{\\partial \\placeholder\{\}\}$/,
    'only the first slot takes the selection',
  );
}

export async function shortcutWrapUndoesInOneStep(page) {
  await addShortcut(page, { trigger: 'abs', latex: '\\left|\\placeholder{}\\right|' });
  await selectInField(page, 'a+x+b', 2, 3);
  await typeTrigger(page, 'abs');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), 'a+x+b', 'one Ctrl+Z restores the unwrapped equation');
}

export async function shortcutWithoutSelectionInsertsAsBefore(page) {
  await addShortcut(page, { trigger: 'abs', latex: '\\left|\\placeholder{}\\right|' });
  await page.evaluate(() => { window.__mf.setValue(''); window.__mf.focus(); });
  await fieldTakesKeys(page);
  await typeTrigger(page, 'abs');
  assertEqual(await latex(page), '\\left|\\placeholder{}\\right|', 'no selection: the empty template');
}

export async function shortcutWithoutASlotReplacesTheSelection(page) {
  await addShortcut(page, { trigger: 'RR', latex: '\\mathbb{R}' });
  await selectInField(page, 'a+x+b', 2, 3);
  await typeTrigger(page, 'RR');
  assertEqual(await latex(page), 'a+\\mathbb{R}+b', 'a template without a slot replaces the selection');
}
