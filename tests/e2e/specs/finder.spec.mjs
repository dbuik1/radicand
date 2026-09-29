/**
 * The `\` finder: our own suggestion list, in flow under the field, replacing
 * MathLive's popover (which rebuilt its DOM on every arrow press). These
 * specs pin the two properties that motivated it – the list is stable under
 * held arrows, and it inserts what it highlights – plus the Escape route back
 * to plain typing.
 */

import { fieldTakesKeys } from '../helpers.mjs';

const OPTIONS = '#command-finder-listbox [role="option"]';

/** Type `\` + letters into an empty field and wait for the list. */
async function typeCommand(page, letters) {
  await page.evaluate(() => {
    window.__mf.setValue('');
    window.__mf.focus();
  });
  await fieldTakesKeys(page);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(60);
  for (const letter of letters) {
    await page.keyboard.press(letter);
    await page.waitForTimeout(40);
  }
  try {
    await page.waitForSelector(OPTIONS, { timeout: 5000 });
  } catch {
    // Name what the field holds, so a lost keystroke reads differently
    // from a list that never rendered.
    const field = await page.evaluate(() => ({
      mode: window.__mf.mode,
      latex: window.__mf.getValue('latex'),
      focused: document.activeElement?.tagName ?? null,
      listHidden: document.querySelector('#command-finder-listbox')?.hidden ?? null,
    }));
    throw new Error(
      `no suggestions for \\${letters.join('')} after 5 s: field in ${field.mode} mode holding ` +
        `${JSON.stringify(field.latex)}, focus on ${field.focused}, list hidden: ${field.listHidden}`,
    );
  }
}

const activeLabel = (page) =>
  page.evaluate(
    (sel) =>
      document.querySelector(`${sel}[aria-selected="true"]`)?.getAttribute('aria-label') ?? null,
    OPTIONS,
  );

/** MathLive's popover was replaced per keystroke; ours must not be. */
export async function optionNodesSurviveTwentyArrows(page) {
  await typeCommand(page, ['s', 'u']);
  // Stamp every option node, then look for the stamps afterwards: a rebuilt
  // list loses them even when it renders the same text.
  const before = await page.evaluate((sel) => {
    const options = [...document.querySelectorAll(sel)];
    options.forEach((option, index) => {
      option.dataset.stamp = `stamp-${index}`;
    });
    return { count: options.length, active: options.findIndex((o) => o.getAttribute('aria-selected') === 'true') };
  }, OPTIONS);
  if (before.count < 2) throw new Error(`expected several suggestions for \\su, got ${before.count}`);

  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(15);
  }
  await page.waitForTimeout(120);

  const after = await page.evaluate((sel) => {
    const options = [...document.querySelectorAll(sel)];
    return {
      count: options.length,
      stamps: options.map((o) => o.dataset.stamp ?? null),
      active: options.findIndex((o) => o.getAttribute('aria-selected') === 'true'),
    };
  }, OPTIONS);

  if (after.count !== before.count) {
    throw new Error(`list changed length: ${before.count} → ${after.count}`);
  }
  const lost = after.stamps.filter((stamp) => stamp === null).length;
  if (lost > 0) throw new Error(`${lost} of ${after.count} option nodes were replaced`);
  // The highlight wraps modulo the list length, so its landing place is
  // known exactly – a list of 2, 4 or 5 rows brings 20 presses back to the
  // start, which is correct, not a stuck highlight.
  const expectedActive = (before.active + 20) % after.count;
  if (after.active !== expectedActive) {
    throw new Error(
      `20 ArrowDowns left the highlight on option ${after.active}; expected ${expectedActive} of ${after.count}`,
    );
  }
}

/** Enter inserts the highlighted command, and lands in maths mode. */
export async function enterInsertsTheHighlightedCommand(page) {
  await typeCommand(page, ['z', 'e', 't']);
  const label = await activeLabel(page);
  if (label === null) throw new Error('no option was highlighted');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const state = await page.evaluate(() => ({
    mode: window.__mf.mode,
    latex: window.__mf.getValue('latex'),
    open: !document.querySelector('#command-finder-listbox')?.hidden,
  }));
  if (state.mode !== 'math') throw new Error(`expected maths mode after Enter, got ${state.mode}`);
  if (!state.latex.startsWith('\\zeta')) throw new Error(`expected \\zeta, got ${state.latex}`);
  if (state.open) throw new Error('the finder stayed open after inserting');
}

/** Arrowing to a later suggestion inserts that one, not the first. */
export async function arrowThenEnterInsertsTheSecondSuggestion(page) {
  await typeCommand(page, ['s', 'u']);
  const first = await activeLabel(page);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(60);
  const second = await activeLabel(page);
  if (first === second) throw new Error(`ArrowDown did not move the highlight (${first})`);
  const inserted = await page.evaluate(
    (sel) => document.querySelector(`${sel}[aria-selected="true"]`)?.querySelector('.symbol-list__cmd')?.textContent ?? null,
    OPTIONS,
  );
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const latex = await page.evaluate(() => window.__mf.getValue('latex'));
  if (latex.trim() === '') throw new Error('nothing was inserted');
  if (!latex.startsWith(inserted)) {
    throw new Error(`expected the highlighted ${inserted}, got ${latex}`);
  }
}

/** Escape closes the list first, and only then leaves LaTeX mode. */
export async function escapeClosesTheListBeforeLeavingLatexMode(page) {
  await typeCommand(page, ['f', 'o', 'r']);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const afterFirst = await page.evaluate(() => ({
    mode: window.__mf.mode,
    open: !document.querySelector('#command-finder-listbox')?.hidden,
  }));
  if (afterFirst.open) throw new Error('Escape did not close the finder');
  if (afterFirst.mode !== 'latex') throw new Error('Escape left LaTeX mode as well as closing the list');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const mode = await page.evaluate(() => window.__mf.mode);
  if (mode !== 'math') throw new Error(`a second Escape should leave LaTeX mode, got ${mode}`);
}

/** A command with no match says so instead of showing a stale list. */
export async function anUnknownCommandShowsNoSuggestions(page) {
  await page.evaluate(() => {
    window.__mf.setValue('');
    window.__mf.focus();
  });
  await fieldTakesKeys(page);
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(60);
  for (const letter of ['q', 'z', 'x']) {
    await page.keyboard.press(letter);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
  const state = await page.evaluate((sel) => {
    const emptyNote = document.querySelector('.command-finder__empty');
    return {
      options: document.querySelectorAll(sel).length,
      // A missing note is not an empty state: the element must be there and shown.
      empty: emptyNote !== null && !emptyNote.hidden,
    };
  }, OPTIONS);
  if (state.options !== 0) throw new Error(`expected no suggestions for \\qzx, got ${state.options}`);
  if (!state.empty) throw new Error('the finder did not say there was no matching command');
}

/**
 * A user who does not know the LaTeX name still finds the symbol: the
 * letters after the `\` are matched against the descriptions too.
 */
export async function descriptionsAreMatchedAsWellAsCommandNames(page) {
  await typeCommand(page, ['a', 'l', 'l']);
  const rows = await page.evaluate((sel) =>
    [...document.querySelectorAll(sel)].map((option) => ({
      label: option.getAttribute('aria-label'),
      command: option.querySelector('.symbol-list__cmd')?.textContent ?? '',
    })), OPTIONS);
  const forall = rows.find((row) => row.command === '\\forall');
  if (!forall) {
    throw new Error(`\\all did not offer \\forall (offered ${JSON.stringify(rows)})`);
  }
  if (!/for all/i.test(forall.label ?? '')) {
    throw new Error(`\\forall was not named by its description (${forall.label})`);
  }
}

/** A command matched by both its name and its description appears once. */
export async function aCommandMatchedTwiceIsListedOnce(page) {
  await typeCommand(page, ['f', 'o', 'r']);
  const commands = await page.evaluate((sel) =>
    [...document.querySelectorAll(sel)].map(
      (option) => option.querySelector('.symbol-list__cmd')?.textContent ?? '',
    ), OPTIONS);
  if (commands[0] !== '\\forall') {
    throw new Error(`expected \\forall first, got ${JSON.stringify(commands)}`);
  }
  const duplicates = commands.filter((command) => command === '\\forall').length;
  if (duplicates !== 1) {
    throw new Error(`\\forall is listed ${duplicates} times`);
  }
}

/** MathLive's own popover must be off: it is what the finder replaces. */
export async function mathlivesOwnPopoverNeverAppears(page) {
  await typeCommand(page, ['s', 'q']);
  const popover = await page.evaluate(() => !!document.querySelector('#mathlive-suggestion-popover'));
  if (popover) throw new Error("MathLive's suggestion popover is still being created");
}

/** A custom shortcut is offered among the commands, first, and inserts. */
export async function aCustomShortcutIsListedFirstAndInserts(page) {
  const shortcut = await page.evaluate(() =>
    window.__shortcuts.addShortcut({ trigger: 'pd', latex: '\\partial', name: 'Partial' }),
  );
  await typeCommand(page, ['p']);
  const first = await activeLabel(page);
  if (first !== 'Partial') throw new Error(`expected the \\pd shortcut first, got ${first}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const state = await page.evaluate(
    (id) => ({
      latex: window.__mf.getValue('latex'),
      uses: window.__shortcuts.getShortcuts().find((s) => s.id === id)?.uses,
      announced: document.getElementById('sr-status')?.textContent,
    }),
    shortcut.id,
  );
  if (state.latex !== '\\partial') throw new Error(`expected \\partial, got ${state.latex}`);
  if (state.uses !== 1) throw new Error(`expected one recorded use, got ${state.uses}`);
  if (state.announced !== 'Inserted Partial') throw new Error(`announced ${state.announced}`);
}

/** A shortcut saved while the panel is open is offered on the next keystroke. */
export async function aShortcutSavedJustNowIsOffered(page) {
  await typeCommand(page, ['z', 'e']);
  await page.evaluate(() => {
    window.__shortcuts.addShortcut({ trigger: 'zet', latex: 'Z', name: 'Zed' });
  });
  await page.keyboard.press('t');
  await page.waitForTimeout(80);
  const first = await activeLabel(page);
  if (first !== 'Zed') throw new Error(`expected the new \\zet shortcut first, got ${first}`);
}

/**
 * Regression: the very first command typed after the panel opens, typed
 * fast and confirmed at once, is matched like any other – the confirm key
 * must not commit the raw text while the command list is still loading.
 */
export async function aFastFirstDescriptionCommandInserts(page) {
  await page.evaluate(() => {
    window.__mf.setValue('');
    window.__mf.focus();
  });
  await fieldTakesKeys(page);
  await page.keyboard.type('\\root');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const value = await page.evaluate(() => window.__mf.getValue('latex'));
  if (!/\\sqrt\{\\placeholder\{\}\}/.test(value)) {
    throw new Error(`first fast \\root + Enter inserts a square root; actual ${JSON.stringify(value)}`);
  }
}
