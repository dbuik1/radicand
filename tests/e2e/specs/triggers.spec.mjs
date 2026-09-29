import { latex, settled, assertEqual, assertMatch, fieldTakesKeys } from '../helpers.mjs';

/**
 * Library `\`-triggers in the autocomplete. The lane is the one autocomplete.ts's docstring defines: a trigger is
 * confirmed with space/Tab/Enter, NEVER auto-accepted – which is what
 * makes shadowing a real command impossible by construction. These specs
 * pin both halves of the contract: a trigger inserts its saved body with
 * tab-navigable placeholders, AND the existing autocomplete behaviours
 * stay byte-identical alongside it.
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

const addEntry = (page, entry) => page.evaluate((e) => { window.__library.addLibraryEntry(e); }, entry);

export async function triggerPlusSpaceInsertsBodyWithPlaceholders(page) {
  await addEntry(page, {
    name: 'My mean',
    body: '\\frac{\\placeholder{}}{\\placeholder{}}',
    trigger: 'mymean',
  });
  await typeSlashCommand(page, 'mymean');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertMatch(
    await latex(page),
    /^\\frac\{\\placeholder\{\}\}\{\\placeholder\{\}\}$/,
    '\\mymean + space inserts the saved template',
  );
  // The inserted placeholders are live: type, Tab, type.
  await page.keyboard.press('1');
  await page.waitForTimeout(40);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(40);
  await page.keyboard.press('2');
  await page.waitForTimeout(40);
  assertMatch(await latex(page), /^\\frac\{?1\}?\{?2\}?$/, 'trigger-inserted template refills');
}

export async function triggerConfirmsWithTabAndEnterToo(page) {
  await addEntry(page, { name: 'Golden', body: '\\varphi', trigger: 'golden' });
  await typeSlashCommand(page, 'golden');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), '\\varphi', '\\golden + Tab inserts the saved body');
  await typeSlashCommand(page, 'golden');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), '\\varphi', '\\golden + Enter inserts the saved body');
}

export async function triggerNeverAutoAccepts(page) {
  // Unlike the curated auto-accept set, a fully typed trigger must sit and
  // wait for its confirm key – pausing must not insert anything.
  await addEntry(page, { name: 'Waits', body: 'w+a+i+t', trigger: 'waits' });
  // With no command delay, any auto-accept timer fires on the next turn of
  // the event loop – before the keystroke's own settle – so the absence
  // below is decided, not merely not-yet-happened.
  await page.evaluate(() => window.__updateSettings({ commandDelay: 0 }));
  await typeSlashCommand(page, 'waits');
  // Still latex-mode text under edit: nothing has been inserted into the
  // equation (an auto-accepted command would appear in the value here).
  assertEqual(await latex(page), '', 'an unconfirmed trigger inserts nothing');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), 'w+a+i+t', 'the pending trigger still confirms afterwards');
}

export async function sumWaitsForConfirmBesideALongerTrigger(page) {
  // The interlock: trigger "sums" extends the command "sum", so \sum must
  // not complete by itself while \sums is still possible.
  await addEntry(page, { name: 'Sum of squares', body: 'x^2+y^2', trigger: 'sums' });
  await typeSlashCommand(page, 'sum');
  await page.waitForTimeout(600);
  assertEqual(await latex(page), '', '\\sum waits while a longer trigger starts with it');
  await page.keyboard.press(' ');
  const boxedSum = /\\sum_\{\\placeholder\{\}\}\^\{\\placeholder\{\}\}/;
  assertMatch(
    await settled(page, boxedSum),
    boxedSum,
    '\\sum + space still confirms and boxes beside a \\sums trigger',
  );
}

export async function longerTriggerStillFiresPastTheAutoAcceptPrefix(page) {
  // …and typing the full \sums + space must fire the trigger, even though
  // its prefix is a command in its own right.
  await addEntry(page, { name: 'Sum of squares', body: 'x^2+y^2', trigger: 'sums' });
  await typeSlashCommand(page, 'sums');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertEqual(await latex(page), 'x^2+y^2', '\\sums + space inserts past the \\sum prefix');
}

export async function bmodStillConfirmsWithSpace(page) {
  // A real command outside the auto-accept set keeps its normal
  // space-confirm path, trigger machinery present or not.
  await addEntry(page, { name: 'Anything', body: 'z', trigger: 'anything' });
  await typeSlashCommand(page, 'bmod');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /\\bmod/, '\\bmod + space still commits the real command');
}

export async function unknownCommandBehaviourIsUnchangedWithoutATrigger(page) {
  // No trigger named "notatrigger" exists: the confirm key must fall
  // through to MathLive's own handling, exactly as it does without a trigger.
  await typeSlashCommand(page, 'notatrigger');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  assertMatch(await latex(page), /notatrigger/, 'an unknown command still commits as typed');
}
