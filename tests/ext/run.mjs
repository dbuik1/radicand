/**
 * Extension smoke lane: builds the REAL extension and loads the `dist/`
 * output into Chromium as an unpacked extension – service worker, manifest,
 * bundled assets and all – then drives the actual side-panel page on its
 * `chrome-extension://` origin.
 *
 * This is the packaged-form complement to the e2e suite (which exercises the
 * editor behaviours against a dev-served bundle): it proves the pieces the
 * dev harness cannot – the manifest wiring, the MV3 service worker, real
 * `chrome.storage` persistence, and the offline invariant with assets served
 * from the extension origin. Exits non-zero on any failure.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchExtensionContext } from '../launch-browser.mjs';
import { npmRun } from '../run-tool.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DIST = path.join(ROOT, 'dist');

console.log('Building the extension...');
npmRun('build');

const manifest = JSON.parse(readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
const panelPath = manifest.side_panel?.default_path;
if (!panelPath) {
  console.error('FAIL  manifest has no side_panel.default_path');
  process.exit(1);
}

const userDataDir = mkdtempSync(path.join(tmpdir(), 'ext-smoke-'));
const context = await launchExtensionContext(DIST, userDataDir);

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` – ${detail}` : ''}`);
  }
};
// Each numbered section runs under its own name: a throw inside it (a
// missing element, a wait that never resolves) is reported as that section's
// failure, and every later section still runs.
// A failed section also leaves a screenshot of the panel, named in the
// failure, for failures seen on only one platform (in EXT_SMOKE_SCREENSHOTS
// when set, which CI keeps, otherwise the system temporary directory).
let currentPage = null;
const section = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    let shot = '';
    if (currentPage) {
      const file = path.join(process.env.EXT_SMOKE_SCREENSHOTS ?? tmpdir(), `ext-smoke-${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
      shot = await currentPage.screenshot({ path: file }).then(() => ` (screenshot: ${file})`, () => '');
    }
    check(name, false, String(error?.message ?? error) + shot);
  }
};

try {
  // The MV3 service worker registers as soon as the extension loads; its URL
  // carries the (dynamically assigned) extension id.
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  check('service worker registered', Boolean(worker));
  const extensionId = new URL(worker.url()).host;

  // The keyboard shortcut that opens the editor is the reserved
  // `_execute_action` command, which Chrome turns into a toolbar click, so it
  // follows whichever surface the toolbar icon opens. Both platforms need a
  // suggested key, and neither may reuse the other command's.
  const commands = manifest.commands ?? {};
  const openKey = commands._execute_action?.suggested_key;
  check(
    'the manifest has a keyboard shortcut that opens the editor',
    Boolean(openKey?.default) && Boolean(openKey?.mac),
    JSON.stringify(commands._execute_action ?? null),
  );
  const keys = Object.values(commands).flatMap((c) => [c.suggested_key?.default, c.suggested_key?.mac]);
  check('no two manifest commands share a suggested key', new Set(keys).size === keys.length, keys.join(', '));

  const page = await context.newPage();
  currentPage = page;
  // MathLive focuses its keyboard sink ~60 ms after a click (and after a
  // programmatic focus()), so a keystroke sent straight after the click can
  // land on whatever was focused before. Wait for the field to own focus.
  const fieldHasFocus = () =>
    page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', undefined, { timeout: 5000 });
  const focusField = async () => {
    await page.locator('math-field').click();
    await fieldHasFocus();
  };
  // Collect genuine errors for the whole session: console errors, page
  // crashes, and any request that fails or leaves the extension/data origin
  // (the offline invariant, observed on the packaged form).
  const consoleErrors = [];
  const badRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('requestfailed', (request) => {
    // A reload aborts any fetch still in flight (e.g. the idle-time speech
    // warm-up); an aborted extension-origin request is not a network breach.
    const errorText = request.failure()?.errorText;
    if (errorText === 'net::ERR_ABORTED' && request.url().startsWith(`chrome-extension://${extensionId}/`)) {
      return;
    }
    badRequests.push(`${request.url()} (${errorText})`);
  });
  const extensionRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(`chrome-extension://${extensionId}/`)) {
      extensionRequests.push(url);
    } else if (!url.startsWith('data:')) {
      badRequests.push(`non-extension request: ${url}`);
    }
  });

  // The workspace shows one mode at a time. This window is wide, so the
  // From controls on the search row render as plain buttons (the compact
  // Insert… ▾ menu is for a docked panel); Settings and Keyboard shortcuts
  // come from More ▾, and every mode hands back with its Close button.
  const openMode = (label) => page.locator('.from-buttons button', { hasText: label }).click();
  // Each step has its own short timeout and names itself when it stalls, so
  // a failure says which of the three went wrong instead of timing out once.
  const openFromMore = async (label) => {
    const step = async (name, action) => {
      try {
        await action();
      } catch (error) {
        throw new Error(`opening ${label} from More ▾: ${name} – ${String(error?.message ?? error).split('\n')[0]}`);
      }
    };
    const item = page.locator('#more-menu [role="menuitem"]', { hasText: label });
    for (let attempt = 1; ; attempt += 1) {
      await step('the More ▾ button', () => page.locator('#more-trigger').click({ timeout: 5000 }));
      await step('the menu', () => page.locator('#more-menu').waitFor({ state: 'visible', timeout: 5000 }));
      const clicked = await item.click({ timeout: 5000 }).then(() => null, (error) => error);
      if (clicked === null) return;
      // The menu closes when focus leaves it. Name where focus went, then
      // open it once more: a second close is a real fault, not a stray one.
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` : 'nothing';
      });
      const open = await page.locator('#more-menu').isVisible();
      const detail = `menu ${open ? 'still open' : 'closed'}, focus on ${focus}`;
      if (attempt === 2) await step(`the ${label} item (${detail})`, () => Promise.reject(clicked));
      console.log(`  note  opening ${label} from More ▾: the item was not clickable (${detail}); retrying`);
    }
  };
  // A reload is complete once the panel has started up, which ends with
  // focus in the equation field; anything opened before then can have focus
  // taken from it.
  const reloadPanel = async () => {
    await page.reload();
    await page.locator('math-field').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', undefined, {
      timeout: 15000,
    });
  };
  const closeMode = () => page.locator('.mode:not([hidden]) .mode__close').click();

  // Write one interface-part flag straight into storage, the way the
  // Ctrl+Shift+Y command's service worker does (the command itself cannot be
  // fired from Playwright).
  const setStoredPart = (part, shown) =>
    page.evaluate(async ({ part, shown }) => {
      const area = chrome.storage.sync ?? chrome.storage.local;
      const stored = (await area.get('settings')).settings ?? {};
      await area.set({
        settings: { ...stored, parts: { ...(stored.parts ?? {}), [part]: shown } },
      });
    }, { part, shown });
  const setSymbolsShown = (shown) => setStoredPart('symbols', shown);
  // Storage writes are debounced (400 ms), so a reload must wait for the
  // write itself rather than a fixed sleep. Each helper resolves once the
  // stored record carries every given field with the given value.
  const storedSettingsHave = (fields) =>
    page.waitForFunction(
      (want) =>
        (chrome.storage.sync ?? chrome.storage.local)
          .get('settings')
          .then((r) => Object.entries(want).every(([key, value]) => r.settings?.[key] === value)),
      fields,
      { timeout: 5000 },
    );
  const storedLibraryEntryHas = (fields) =>
    page.waitForFunction(
      (want) =>
        chrome.storage.local
          .get('library')
          .then((r) =>
            (r.library?.entries ?? []).some((entry) => Object.entries(want).every(([key, value]) => entry[key] === value)),
          ),
      fields,
      { timeout: 5000 },
    );

  await section('the panel boots', async () => {
    // 1. The real panel page boots on the extension origin.
    await page.goto(`chrome-extension://${extensionId}/${panelPath}`);
    const field = page.locator('math-field');
    const booted = await field.waitFor({ timeout: 15000 }).then(() => true, () => false);
    check('panel boots on the chrome-extension:// origin', booted, 'no math-field appeared');
  });

  await section('typing reaches the source view', async () => {
    // 2. Typing renders and round-trips into the LaTeX source view.
    await focusField();
    await page.keyboard.type('x^2+1');
    await page.waitForFunction(
      () => document.querySelector('#source-input')?.value.replace(/\s/g, '') === 'x^2+1',
      undefined,
      { timeout: 5000 },
    ).catch(() => {});
    const sourceValue = await page.locator('#source-input').inputValue();
    check(
      'typing reaches the LaTeX source view',
      sourceValue.replace(/\s/g, '') === 'x^2+1',
      `source shows ${JSON.stringify(sourceValue)}`,
    );
  });

  await section('a palette insert', async () => {
    // 3. A palette insert lands in the field and is announced.
    await page.locator('.palette__btn[aria-label="Fraction"]').first().click();
    await page.waitForFunction(
      () => document.querySelector('#sr-status')?.textContent.includes('Inserted'),
      undefined,
      { timeout: 5000 },
    ).catch(() => {});
    const status = await page.locator('#sr-status').textContent();
    check('palette insert is announced', status.includes('Inserted Fraction'), `live region: ${JSON.stringify(status)}`);
  });

  await section('the \\ finder', async () => {
    // 3b. The `\` finder: its two bundled indexes must dynamic-import cleanly
    //     under the extension's MV3 CSP, and Enter must insert the highlight.
    await page.evaluate(() => {
      document.querySelector('math-field')?.setValue('');
    });
    await focusField();
    await page.keyboard.press('Backslash');
    await page.waitForTimeout(80);
    await page.keyboard.type('su', { delay: 60 });
    await page
      .locator('#command-finder-listbox [role="option"]')
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});
    const suggestions = await page.locator('#command-finder-listbox [role="option"]').count();
    check('the \\ finder suggests commands on the packaged origin', suggestions > 1, `${suggestions} suggestions`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => (document.querySelector('#source-input')?.value ?? '').includes('\\su'),
      undefined,
      { timeout: 5000 },
    ).catch(() => {});
    const finderSource = await page.locator('#source-input').inputValue();
    check(
      'the \\ finder inserts the highlighted command',
      finderSource.includes('\\su'),
      `source shows ${JSON.stringify(finderSource)}`,
    );
    await page.evaluate(() => {
      document.querySelector('math-field')?.setValue('');
    });
  });

  await section('auto-fit', async () => {
    // 3c. Auto-fit shrinks an equation too wide for the panel. MathLive clips
    //     the rendered maths inside its own shadow root, so this measures the
    //     box that actually overflows – the host element never reports one.
    const wideWindow = page.viewportSize();
    try {
      await page.setViewportSize({ width: 400, height: 900 }); // a docked side panel
      await page.evaluate(() => {
        document
          .querySelector('math-field')
          ?.setValue('\\begin{pmatrix}1&2&3&4&5&6\\\\7&8&9&10&11&12\\end{pmatrix}');
      });
      await page.waitForTimeout(600);
      const fitted = await page.evaluate(() => {
        const field = document.querySelector('math-field');
        const content = field?.shadowRoot?.querySelector('.ML__content');
        if (!field || !content) return null;
        return {
          fit: field.style.getPropertyValue('--equation-fit'),
          overflow: content.scrollWidth - content.clientWidth,
        };
      });
      check(
        'auto-fit shrinks a too-wide equation until it fits',
        fitted !== null && fitted.fit !== '' && Number(fitted.fit) < 1 && fitted.overflow <= 1,
        fitted === null
          ? 'no .ML__content in the field shadow root'
          : `fit ${JSON.stringify(fitted.fit)}, overflowing by ${fitted.overflow}px`,
      );
      await page.evaluate(() => {
        document.querySelector('math-field')?.setValue('');
      });
    } finally {
      if (wideWindow) await page.setViewportSize(wideWindow);
    }
  });

  await section('symbol search', async () => {
    // 4. Symbol search works in the packaged form: the lazy-loaded index and
    //    engine chunks must dynamic-import cleanly under the extension's MV3
    //    CSP, render results, and insert on Enter.
    await page.locator('#symbol-search-input').fill('for all');
    await page.locator('[role="option"]').first().waitFor({ timeout: 10000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#source-input')?.value.includes('\\forall'),
      undefined,
      { timeout: 5000 },
    ).catch(() => {});
    const searchedSource = await page.locator('#source-input').inputValue();
    check(
      'symbol search inserts on the packaged origin',
      searchedSource.includes('\\forall'),
      `source shows ${JSON.stringify(searchedSource)}`,
    );
  });

  await section('Ctrl+/ and the Escape chain', async () => {
    // 4b. Ctrl+/ (Cmd+/ on a Mac) opens the quick search under the field from
    //     anywhere in the panel – including out of MathLive's shadow root and
    //     out of an open workspace mode – and Enter inserts and returns to
    //     the field.
    const quickState = () =>
      page.evaluate(() => ({
        focused: document.activeElement?.id ?? '',
        shown: !(document.querySelector('.quick-search')?.hidden ?? true),
        query: document.getElementById('quick-search-input')?.value ?? '',
        tag: document.activeElement?.tagName ?? '',
        drawing: Boolean(document.querySelector('.mode--drawing:not([hidden])')),
      }));
    await focusField();
    await page.keyboard.press('ControlOrMeta+Slash');
    const fromField = await quickState();
    check(
      'Ctrl+/ opens the quick search from the equation field',
      fromField.focused === 'quick-search-input' && fromField.shown && fromField.query === '',
      `focus ${JSON.stringify(fromField.focused)}, shown: ${fromField.shown}`,
    );
    await page.keyboard.press('Escape');
    // MathLive lands focus in its field on a short timer.
    await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', undefined, { timeout: 2000 }).catch(() => {});
    const afterEscape = await quickState();
    check(
      'Escape closes the quick search and returns to the field',
      !afterEscape.shown && afterEscape.tag === 'MATH-FIELD',
      `shown: ${afterEscape.shown}, focus on ${JSON.stringify(afterEscape.tag)}`,
    );

    // MathLive re-focuses its field 60 ms after it gains focus: a Ctrl+/
    // pressed inside that window must still leave the quick search open.
    await page.keyboard.press('ControlOrMeta+Slash');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+Slash');
    await page.waitForTimeout(200);
    const afterRefocus = await quickState();
    check(
      'Ctrl+/ straight after Escape reopens the quick search and it stays open',
      afterRefocus.focused === 'quick-search-input' && afterRefocus.shown,
      `focus ${JSON.stringify(afterRefocus.focused)}, shown: ${afterRefocus.shown}`,
    );
    await page.keyboard.press('Escape');

    await openMode('Drawing');
    await page.keyboard.press('ControlOrMeta+Slash');
    const fromMode = await quickState();
    check(
      'Ctrl+/ opens the quick search over an open mode',
      fromMode.focused === 'quick-search-input' && fromMode.shown && fromMode.drawing,
      `focus ${JSON.stringify(fromMode.focused)}, drawing shown: ${fromMode.drawing}`,
    );
    const before = await page.locator('#source-input').inputValue();
    await page.keyboard.type('empty set');
    await page.locator('#quick-search-listbox [role="option"]').first().waitFor({ timeout: 10000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (prior) => document.querySelector('#source-input')?.value !== prior,
      before,
      { timeout: 5000 },
    ).catch(() => {});
    // Focus reaches the field on MathLive's short timer, and sits on the page
    // until then.
    await page
      .waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', undefined, { timeout: 2000 })
      .catch(() => {});
    const afterEnter = await quickState();
    const inserted = await page.locator('#source-input').inputValue();
    check(
      'Enter in the quick search inserts, closes it and returns to the field',
      inserted !== before && !afterEnter.shown && afterEnter.tag === 'MATH-FIELD',
      `source ${JSON.stringify(inserted)}, shown: ${afterEnter.shown}, focus on ${JSON.stringify(afterEnter.tag)}`,
    );
    await closeMode();

    // MathLive's deferred field focus lands inside the grace window after the
    // Symbols box gains focus: the field's focus is forced here the way that
    // timer does it, and the list must survive.
    await page.locator('#symbol-search-input').fill('for all');
    await page.locator('#symbol-search-listbox [role="option"]').first().waitFor({ timeout: 10000 });
    await page.evaluate(() => {
      const input = document.getElementById('symbol-search-input');
      // Synchronous, so the timing cannot drift on a slow machine: the box
      // gains focus (the event the grace window counts from) and the field
      // takes it in the same task, as MathLive's deferred focus does.
      input.focus();
      input.dispatchEvent(new FocusEvent('focus'));
      document.querySelector('math-field').focus();
    });
    // A negative assertion: wait past MathLive's 60 ms timer so the steal, if
    // it is going to land, has.
    await page.waitForTimeout(300);
    const afterSteal = await page.evaluate(() => ({
      listHidden: document.getElementById('symbol-search-listbox')?.hidden ?? true,
      focused: document.activeElement?.id ?? '',
    }));
    check(
      'Symbols search keeps its list when the field takes focus just after it gained it',
      !afterSteal.listHidden && afterSteal.focused === 'symbol-search-input',
      `list hidden: ${afterSteal.listHidden}, focus on ${JSON.stringify(afterSteal.focused)}`,
    );

    // Escape is progressive: close the results list, clear the query, then
    // hand focus back to the equation field.
    await page.locator('#symbol-search-input').fill('for all');
    await page.locator('#symbol-search-listbox [role="option"]').first().waitFor({ timeout: 10000 });
    const escapeStep = async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      return page.evaluate(() => ({
        listHidden: document.getElementById('symbol-search-listbox')?.hidden ?? true,
        query: document.getElementById('symbol-search-input')?.value ?? '',
        tag: document.activeElement?.tagName ?? '',
      }));
    };
    const describe = (state) =>
      `list ${state.listHidden ? 'hidden' : 'shown'}, query ${JSON.stringify(state.query)}, focus on ${JSON.stringify(state.tag)}`;
    const afterFirstEscape = await escapeStep();
    check(
      'the first Escape closes the results list and keeps the query',
      afterFirstEscape.listHidden && afterFirstEscape.query === 'for all' && afterFirstEscape.tag === 'INPUT',
      describe(afterFirstEscape),
    );
    const afterSecondEscape = await escapeStep();
    check(
      'the second Escape clears the query and stays in the search box',
      afterSecondEscape.query === '' && afterSecondEscape.tag === 'INPUT',
      describe(afterSecondEscape),
    );
    const afterThirdEscape = await escapeStep();
    check(
      'the third Escape returns to the equation field',
      afterThirdEscape.tag === 'MATH-FIELD' && afterThirdEscape.query === '',
      describe(afterThirdEscape),
    );
  });

  await section('draw-to-find', async () => {
    // 4c. Draw-to-find works in the packaged form: the lazy recogniser chunk
    //     must dynamic-import under the MV3 CSP, and a real pointer-drawn ∀
    //     (two slanted strokes and a crossbar) must rank "For all" among the
    //     candidates and insert it.
    await focusField();
    for (let tries = 0; tries < 5; tries++) {
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(250); // the source view updates on a debounce
      if ((await page.locator('#source-input').inputValue()).trim() === '') break;
    }
    check(
      'equation cleared before the draw test',
      (await page.locator('#source-input').inputValue()).trim() === '',
    );
    await openMode('Drawing');
    const surfaceBox = await page.locator('.draw-find__surface').boundingBox();
    if (!surfaceBox) throw new Error('the drawing surface has no bounding box');
    // Draw at twice the symbol's natural width – the measured tolerance for
    // most symbols (recogniser.test.ts asserts it per drawing; genuinely
    // ambiguous-when-flattened shapes are asserted at 1.5x). The surface
    // itself is width-capped in CSS so the box never invites more stretch
    // than the matcher can read.
    const inset = 8;
    const regionHeight = surfaceBox.height - 2 * inset;
    const regionWidth = Math.min(surfaceBox.width - 2 * inset, 2 * regionHeight);
    const at = (fx, fy) => [
      surfaceBox.x + (surfaceBox.width - regionWidth) / 2 + fx * regionWidth,
      surfaceBox.y + inset + fy * regionHeight,
    ];
    const drawStroke = async (points) => {
      await page.mouse.move(...at(...points[0]));
      await page.mouse.down();
      for (const point of points.slice(1)) {
        await page.mouse.move(...at(...point), { steps: 8 });
      }
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    await drawStroke([[0.18, 0.06], [0.5, 0.92]]);
    await drawStroke([[0.82, 0.06], [0.5, 0.92]]);
    await drawStroke([[0.31, 0.45], [0.69, 0.45]]);
    // The drawn ∀ must not merely appear somewhere in the list – it must be
    // the best match.
    const bestOption = page.locator('.draw-find__option--best[aria-label="For all"]');
    const recognised = await bestOption
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check('draw-to-find ranks a double-width drawn ∀ as the best match', recognised);
    if (recognised) {
      await bestOption.click();
      await page.waitForFunction(
        () => document.querySelector('#source-input')?.value.includes('\\forall'),
        undefined,
        { timeout: 5000 },
      ).catch(() => {});
    }
    const drawnSource = await page.locator('#source-input').inputValue();
    check(
      'draw-to-find recognises and inserts on the packaged origin',
      drawnSource.includes('\\forall'),
      `source shows ${JSON.stringify(drawnSource)}`,
    );
    await closeMode();
    const symbolsBack = await page
      .locator('#symbol-search-input')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);
    check('closing Drawing hands the workspace back to the symbols', symbolsBack, 'the search box did not reappear');
  });

  await section('the Style menu and the symbols flag', async () => {
    // 5. The Style menu styles the selection through a real MathLive field, and
    //    the symbols workspace follows the persisted flag the Ctrl+Shift+Y
    //    command flips in storage.
    await focusField();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type('x');
    await page.keyboard.press('Control+a');
    await page.locator('#style-trigger').click();
    await page.getByRole('menuitemcheckbox', { name: 'Bold', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('#source-input')?.value.includes('\\mathbf'),
      undefined,
      { timeout: 5000 },
    ).catch(() => {});
    const styledSource = await page.locator('#source-input').inputValue();
    check('the Style menu applies bold to the selection', styledSource.includes('\\mathbf'), `source shows ${JSON.stringify(styledSource)}`);
    const focusInField = await fieldHasFocus().then(() => true, () => false);
    check('the Style menu returns focus to the field', focusInField);

    await setSymbolsShown(false);
    const collapsed = await page
      .locator('.palette__tab')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .then(() => true, () => false);
    check('hiding the symbols from storage collapses the workspace', collapsed, 'the palette tabs stayed visible');
    await setSymbolsShown(true);
    const reopened = await page
      .locator('.palette__tab')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);
    check('showing the symbols from storage reopens the workspace', reopened, 'the palette tabs stayed hidden');
  });

  await section('menus stay inside a docked panel', async () => {
    // 5a. At a docked panel's width every menu list must land inside the
    //     viewport: the Copy format half sits at the left edge of its bar
    //     and Style ▾ near the middle of the header, so each opens to
    //     whichever side has the room.
    const wideWindow = page.viewportSize();
    try {
      await page.setViewportSize({ width: 400, height: 900 });
      for (const [menu, name] of [
        ['copy-format', 'the Copy format menu'],
        ['style', 'the Style menu'],
        ['more', 'the More menu'],
        ['from', 'the Insert… menu'],
      ]) {
        await page.locator(`#${menu}-trigger`).click();
        const box = await page.evaluate((id) => {
          const rect = document.getElementById(`${id}-menu`)?.getBoundingClientRect();
          return rect ? { left: Math.round(rect.left), right: Math.round(rect.right) } : null;
        }, menu);
        check(
          `${name} opens inside a 400px panel`,
          box !== null && box.left >= 0 && box.right <= 400,
          box ? `list spans ${box.left}–${box.right}px` : 'no list',
        );
        await page.keyboard.press('Escape');
      }
    } finally {
      if (wideWindow) await page.setViewportSize(wideWindow);
    }
  });

  await section('Ctrl+/ with hidden symbols', async () => {
    // 5b. Ctrl+/ still opens the quick search once the symbols are hidden:
    //     the popup lives under the field, so the symbols stay hidden.
    await setSymbolsShown(false);
    await page.locator('.palette__tab').first().waitFor({ state: 'hidden', timeout: 5000 });
    await focusField();
    await page.keyboard.press('ControlOrMeta+Slash');
    const afterHidden = await page.evaluate(() => ({
      focused: document.activeElement?.id ?? '',
      stillHidden: document.querySelector('.palette__tab')?.offsetParent === null,
    }));
    check(
      'Ctrl+/ opens the quick search with the symbols hidden',
      afterHidden.focused === 'quick-search-input' && afterHidden.stillHidden,
      `focus ${JSON.stringify(afterHidden.focused)}, symbols still hidden: ${afterHidden.stillHidden}`,
    );
    await page.keyboard.press('Escape');
    await focusField();
  });

  await section('the interface toggles', async () => {
    // 5c. Every piece of interface except the equation field can be switched
    //     off from Settings and switched back on, by keyboard alone, and the
    //     choice survives a reload through real chrome.storage. Alt+, is the
    //     route back into Settings once the More ▾ menu is one of the pieces
    //     that went.
    await openFromMore('Settings');
    const boxes = page.locator('input[id^="set-part-"]');
    const partCount = await boxes.count();
    check('Settings offers a checkbox for every piece of interface', partCount >= 11, `${partCount} checkboxes`);

    for (let index = 0; index < partCount; index += 1) {
      const box = boxes.nth(index);
      await box.focus();
      await page.keyboard.press('Space');
    }
    const bare = await page.evaluate(() => {
      const off = (selector) => {
        const el = document.querySelector(selector);
        return !el || el.hidden || el.closest('[hidden]') !== null;
      };
      return {
        field: Boolean(document.querySelector('math-field')),
        more: off('#more-trigger'),
        style: off('#style-trigger'),
        source: off('details.source'),
        actions: off('.actions-bar'),
      };
    });
    check('switching every piece off leaves the equation field', bare.field);
    check('the menus, the source and the actions bar all go', bare.more && bare.style && bare.source && bare.actions);

    // Wait for the debounced write of the last toggle before reloading.
    await page.waitForFunction(
      () =>
        (chrome.storage.sync ?? chrome.storage.local)
          .get('settings')
          .then((r) => r.settings?.parts?.moreMenu === false),
      undefined,
      { timeout: 5000 },
    );
    await reloadPanel();
    const afterReload = await page.evaluate(() => {
      const el = document.querySelector('#more-trigger');
      return {
        more: !el || el.hidden || el.closest('[hidden]') !== null,
        field: Boolean(document.querySelector('math-field')),
      };
    });
    check('the choice survives a reload', afterReload.more && afterReload.field);

    // With More ▾ gone, Alt+, is the only route into Settings – and therefore
    // the route back to every other toggle.
    await page.locator('math-field').click();
    await page.keyboard.press('Alt+Comma');
    const settingsOpen = await page
      .locator('.mode--settings')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);
    check('Alt+, opens Settings with the More menu switched off', settingsOpen);

    await page.locator('#set-parts-restore').focus();
    await page.keyboard.press('Enter');
    const restored = await page
      .locator('#more-trigger')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false);
    check('"Show every piece" brings the whole interface back', restored);
    // The restore is saved after a short delay, and the stored change is
    // applied again when it lands; let it land before the next section
    // opens a menu that the re-application could close under it.
    await page.waitForFunction(
      () =>
        (chrome.storage.sync ?? chrome.storage.local)
          .get('settings')
          .then((r) => r.settings?.parts?.moreMenu !== false),
      undefined,
      { timeout: 5000 },
    );
    await closeMode();
  });

  await section('settings persistence', async () => {
    // 6. A settings change persists across a reload through real chrome.storage.
    //    Wait for the debounced write to land before reloading so the test
    //    exercises the normal write path, not the pagehide flush.
    await openFromMore('Settings');
    await page.locator('#eq-size-number').fill('150');
    await page.locator('#eq-size-number').dispatchEvent('change');
    await storedSettingsHave({ equationScale: 1.5 });
    await reloadPanel();
    await openFromMore('Settings');
    const persisted = await page.locator('#eq-size-number').inputValue();
    check('equation size persists across a reload', persisted === '150', `after reload: ${persisted}%`);
    await closeMode();
  });

  await section('the toolbar icon follows the chosen surface', async () => {
    // The side panel opens on a toolbar click only while Chrome's panel
    // behaviour says so; any other choice hands the click to the worker,
    // which opens the window or tab. A real click cannot be sent from
    // Playwright, so the behaviour Chrome holds is what is checked.
    const opensPanel = () => worker.evaluate(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick);
    const waitFor = async (want) => {
      for (let i = 0; i < 50; i += 1) {
        if ((await opensPanel()) === want) return true;
        await page.waitForTimeout(100);
      }
      return false;
    };
    check('the toolbar icon opens the side panel by default', await waitFor(true));
    await openFromMore('Settings');
    const select = page.locator('#set-surface');
    check(
      'Settings says when the toolbar choice applies',
      (await page.locator('#set-surface-hint').textContent()).includes('Applies next time'),
    );
    await select.selectOption('tab');
    await storedSettingsHave({ defaultSurface: 'tab' });
    check('choosing a tab hands the toolbar click to the worker', await waitFor(false));
    await select.selectOption('panel');
    await storedSettingsHave({ defaultSurface: 'panel' });
    check('choosing the side panel gives the click back to Chrome', await waitFor(true));
    await closeMode();
  });

  await section('the pop-out window remembers its bounds', async () => {
    // The pop-out opens at the bounds saved in chrome.storage.local, and
    //   resizing it stores the new ones.
    const seeded = { left: 40, top: 50, width: 700, height: 600, area: { left: 0, top: 0, width: 1920, height: 1080 } };
    await page.evaluate((bounds) => chrome.storage.local.set({ popoutBounds: bounds }), seeded);
    // Headless Chromium sizes every popup to the screen whatever it is asked
    // for, so what is checked is the request the panel makes.
    await page.evaluate(() => {
      const create = chrome.windows.create.bind(chrome.windows);
      window.__popupRequests = [];
      chrome.windows.create = (options) => {
        window.__popupRequests.push(options);
        return create(options);
      };
    });
    const popupPromise = context.waitForEvent('page', { timeout: 10000 });
    await openFromMore('Open in a new window');
    const popup = await popupPromise;
    await popup.locator('math-field').waitFor({ timeout: 15000 });
    const request = await page.evaluate(() => window.__popupRequests[0] ?? null);
    check(
      'the pop-out reopens at the saved size and place',
      request?.type === 'popup' &&
        request.width === 700 && request.height === 600 && request.left === 40 && request.top === 50,
      JSON.stringify(request),
    );
    const opened = await page.evaluate(async () => (await chrome.windows.getAll({ windowTypes: ['popup'] }))[0] ?? null);
    await page.evaluate((id) => chrome.windows.update(id, { width: 640, height: 520 }), opened?.id);
    const stored = await page
      .waitForFunction(
        () =>
          chrome.storage.local
            .get('popoutBounds')
            .then((r) => (Math.abs((r.popoutBounds?.width ?? 0) - 640) <= 20 ? r.popoutBounds : false)),
        undefined,
        { timeout: 10000 },
      )
      .then((handle) => handle.jsonValue(), () => null);
    check('resizing the pop-out stores its new bounds', stored !== null, 'popoutBounds stayed at the seeded size');
    await popup.close();
  });

  await section('the expression library', async () => {
    // 6b. The expression library round-trips through real chrome.storage.local:
    //     Alt+S captures the equation, My library lists it, Insert puts it
    //     back, and it survives a reload.
    await focusField();
    await page.keyboard.type('a+b');
    await page.waitForTimeout(200);
    await page.keyboard.press('Alt+s');
    const nameField = page.locator('.library-form input').first();
    await nameField.waitFor({ timeout: 5000 });
    await nameField.fill('Smoke expression');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#sr-status')?.textContent.includes('Saved "Smoke expression"'),
      undefined,
      { timeout: 5000 },
    ).catch(() => {});
    check(
      'Alt+S saves the equation to the library',
      (await page.locator('#sr-status').textContent()).includes('Saved "Smoke expression"'),
    );
    await openMode('My library');
    const row = page.locator('.library-row__insert[aria-label="Smoke expression"]');
    await row.waitFor({ timeout: 5000 });
    await page.evaluate(() => { window.__cleared = document.querySelector('math-field').setValue(''); });
    await row.click();
    await page.waitForFunction(
      () => document.querySelector('#source-input')?.value.replace(/\s/g, '').includes('a+b'),
      undefined,
      { timeout: 5000 },
    ).catch(() => {});
    check(
      'a library entry inserts from My library',
      (await page.locator('#source-input').inputValue()).replace(/\s/g, '').includes('a+b'),
    );
    // The insert bumps the entry's use count; that debounced write landing
    // means the whole entry is in storage.
    await storedLibraryEntryHas({ name: 'Smoke expression', uses: 1 });
    await reloadPanel();
    await openMode('My library');
    const survived = await page
      .locator('.library-row__insert[aria-label="Smoke expression"]')
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    check('the library survives a reload through chrome.storage.local', survived, 'the saved entry was not listed after the reload');
  });

  await section('the equation actions', async () => {
    // 6c. Copy, Speak and Save to library sit directly under the field, out
    //     of the scrolling workspace, as one Tab stop, and stay on screen in
    //     a short, narrow panel.
    await reloadPanel();
    const place = await page.evaluate(() => {
      const bar = document.querySelector('.actions-bar');
      const field = document.querySelector('math-field').getBoundingClientRect();
      const body = document.querySelector('.panel-body').getBoundingClientRect();
      const box = bar.getBoundingClientRect();
      return {
        toolbar: bar.getAttribute('role') === 'toolbar',
        outside: !bar.closest('.panel-body'),
        between: box.top >= field.bottom && box.bottom <= body.top,
      };
    });
    check('the actions bar is a toolbar outside the scrolling workspace', place.toolbar && place.outside);
    check('the actions bar sits between the field and the workspace', place.between);

    await focusField();
    await page.keyboard.press('Tab');
    const onCopy = await page.evaluate(() => document.activeElement?.classList.contains('copy-split__main'));
    check('Tab from the field lands on Copy', onCopy);
    const walk = [];
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press('ArrowRight');
      walk.push(await page.evaluate(() => document.activeElement?.textContent.trim()));
    }
    check('arrow keys walk the actions', walk[1] === 'Speak' && walk[2] === 'Save to library', walk.join(' | '));
    await page.keyboard.press('Tab');
    const intoWorkspace = await page.evaluate(() => Boolean(document.activeElement?.closest('.panel-body')));
    check('the next Tab goes on into the workspace', intoWorkspace);
    await page.keyboard.press('Shift+Tab');
    const back = await page.evaluate(() => document.activeElement?.textContent.trim());
    check('Shift+Tab returns to the last action used', back === 'Save to library', back);

    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 360, height: 400 });
    await page.waitForTimeout(200);
    const onScreen = await page.evaluate(() =>
      [...document.querySelectorAll('.actions-bar button:not(.menu__item)')]
        .filter((b) => !b.closest('[role="menu"]'))
        .every((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
        }),
    );
    check('every action is on screen in a 360×400 panel', onScreen);
    if (viewport) await page.setViewportSize(viewport);
  });

  await section('maths in library names and previews', async () => {
    // 6d. Rendered maths outside the field is laid out (MathLive's static
    //     stylesheet is loaded), and maths between $ signs in a formula name
    //     renders in the list and is spoken in its accessible name. The
    //     suggested name is the equation itself between $ signs.
    await focusField();
    await page.keyboard.type('x^2');
    await page.waitForTimeout(200);
    await page.keyboard.press('Alt+s');
    const nameField = page.locator('.library-form input').first();
    await nameField.waitFor({ timeout: 5000 });
    const suggested = await nameField.inputValue();
    check('the suggested name is the equation as maths', suggested.replace(/\s/g, '') === '$x^2$', suggested);
    await nameField.fill('Area $\\pi r^2$');
    const namePreview = await page
      .locator('.library-form__name-preview .name-maths')
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    check('a name with maths shows it rendered under the Name field', namePreview);
    await nameField.press('Enter');
    await openMode('My library');
    const row = page.locator('.library-row__insert', { has: page.locator('.name-maths') }).first();
    const listed = await row.waitFor({ timeout: 5000 }).then(() => true, () => false);
    check('the name renders its maths in My library', listed);
    const label = listed ? await row.getAttribute('aria-label') : '';
    check('the name is spoken as words', /^Area /.test(label ?? '') && !(label ?? '').includes('$'), label ?? '');
    const laidOut = await page.evaluate(() => {
      const maths = document.querySelector('.library-row .ML__latex');
      return maths ? getComputedStyle(maths).display === 'inline-block' : false;
    });
    check('rendered previews get MathLive\'s layout styles', laidOut);
  });

  await section('custom shortcuts', async () => {
    // 6b'. Custom shortcuts opens from More ▾, the common set lands in real
    //      chrome.storage.local, a trigger from it confirms in the field, and
    //      at 320px every control of the mode is on screen.
    await openFromMore('Custom shortcuts');
    await page.locator('.mode--customShortcuts button', { hasText: /^Add \d+ common shortcuts$/ }).click();
    await page.locator('.mode--customShortcuts .library-row__insert').first().waitFor({ timeout: 5000 });
    const stored = await page
      .waitForFunction(
        () => chrome.storage.local.get('shortcuts').then((r) => (r.shortcuts?.entries?.length ?? 0) >= 40),
        undefined,
        { timeout: 5000 },
      )
      .then(() => true, () => false);
    check('the common shortcuts are stored in chrome.storage.local', stored);

    const wideWindow = page.viewportSize();
    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(200);
    const offscreen = await page.evaluate(() =>
      [...document.querySelectorAll('.mode--customShortcuts button, .mode--customShortcuts input')]
        .filter((el) => el.checkVisibility())
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.left < 0 || rect.right > 320)
        .map(({ el }) => el.textContent.trim() || el.id || el.className),
    );
    check(
      'every Custom shortcuts control is on screen at 320px',
      offscreen.length === 0,
      `outside the viewport: ${offscreen.slice(0, 4).join(', ')}`,
    );
    if (wideWindow) await page.setViewportSize(wideWindow);
    await closeMode();

    await page.evaluate(() => document.querySelector('math-field').setValue(''));
    await focusField();
    await page.keyboard.type('\\al');
    await page.keyboard.press('Space');
    const expanded = await page
      .waitForFunction(
        () => document.querySelector('#source-input')?.value.includes('\\alpha'),
        undefined,
        { timeout: 5000 },
      )
      .then(() => true, () => false);
    check(
      'a common shortcut confirms in the field',
      expanded,
      `the source reads ${JSON.stringify(await page.locator('#source-input').inputValue())}`,
    );
    await page.evaluate(() => document.querySelector('math-field').setValue(''));
  });

  await section('a 2,000-entry library', async () => {
    // 6c. A 2,000-entry synthetic library renders and scrolls responsively –
    //     previews are lazy, so opening the mode must not render 2,000 formulae.
    //     The budgets are smoke-level: wide enough for a loaded runner, with the
    //     measured figure printed so a slide is visible before it fails.
    await page.evaluate(() => {
      const entries = Array.from({ length: 2000 }, (_, i) => ({
        id: `seed-${i}`,
        name: `Synthetic entry ${i}`,
        body: `x_{${i}}+\\frac{${i}}{2}`,
        created: i,
        modified: i,
        uses: 0,
      }));
      return chrome.storage.local.set({ library: { version: 1, entries } });
    });
    await reloadPanel();
    const tabOpenStart = Date.now();
    await openMode('My library');
    await page.locator('.library-row').first().waitFor({ timeout: 10000 });
    const tabOpenMs = Date.now() - tabOpenStart;
    check(`a 2,000-entry library opens responsively (${tabOpenMs} ms, smoke budget 10 s)`, tabOpenMs < 10000);
    const scrollFrameMs = await page.evaluate(async () => {
      const list = document.querySelector('.library-panel__list');
      const t0 = performance.now();
      list.scrollTop = list.scrollHeight / 2;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      list.scrollTop = list.scrollHeight;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return (performance.now() - t0) / 2;
    });
    check(
      `a 2,000-entry library scrolls without jank (${scrollFrameMs.toFixed(0)} ms/frame, smoke budget 250 ms)`,
      scrollFrameMs < 250,
    );
    // Each filter keystroke rebuilds every matching row, so the handler plus
    // the next painted frame must stay within a few frames at 2,000 entries.
    const filterKeystrokeMs = await page.evaluate(async () => {
      const filter = document.getElementById('library-filter');
      const samples = [];
      for (const value of ['S', 'Sy', 'Syn', 'Synt', 'Synth']) {
        filter.value = value;
        const t0 = performance.now();
        filter.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        samples.push(performance.now() - t0);
      }
      filter.value = '';
      filter.dispatchEvent(new Event('input', { bubbles: true }));
      return Math.max(...samples);
    });
    check(
      `filtering a 2,000-entry library keeps up with typing (${filterKeystrokeMs.toFixed(0)} ms/keystroke, smoke budget 250 ms)`,
      filterKeystrokeMs < 250,
    );
    // Inserting must not rebuild the list: the activated button stays in the
    // document with focus, so a second Enter inserts again.
    const insertFromList = await page.evaluate(async () => {
      const button = document.querySelector('.library-row__insert');
      button.focus();
      const t0 = performance.now();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        ms: performance.now() - t0,
        connected: button.isConnected,
        focused: document.activeElement === button,
        id: button.closest('.library-row')?.dataset.id ?? null,
      };
    });
    check(
      `inserting from a 2,000-entry library keeps the row and its focus (${insertFromList.ms.toFixed(0)} ms, smoke budget 250 ms)`,
      insertFromList.connected && insertFromList.focused && insertFromList.ms < 250,
    );
    // Leave storage clean for the checks that follow – once the use count's
    // debounced write has landed, so it cannot write the library back.
    await storedLibraryEntryHas({ id: insertFromList.id, uses: 1 });
    await page.evaluate(() => chrome.storage.local.remove('library'));
  });

  await section('library category filter', async () => {
    // The category control appears only for a library with categories, is a
    // labelled select a keyboard can drive, and narrows the list with the
    // text search; an empty result names the way out.
    await page.evaluate(() =>
      chrome.storage.local.set({
        library: { version: 1, entries: [{ id: 'own-1', name: 'Own', body: 'x', created: 1, modified: 1, uses: 0 }] },
      }),
    );
    await reloadPanel();
    await openMode('My library');
    await page.locator('.library-row').first().waitFor({ timeout: 5000 });
    check('the category filter is hidden while no entry has a category', !(await page.locator('#library-category').isVisible()));
    await page.locator('.library-row__edit').first().click();
    await page.getByLabel('Category (optional)').fill(' Algebra ');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.locator('#library-category').waitFor({ state: 'visible', timeout: 5000 });
    check(
      'a category set in the edit form appears in the filter at once',
      (await page.locator('#library-category option').allTextContents()).join('|') === 'All categories|Algebra',
    );
    await page.evaluate(() => {
      const entry = (i, name, category) => ({
        id: `cat-${i}`,
        name,
        body: `x_{${i}}`,
        created: i,
        modified: i,
        uses: 0,
        ...(category ? { category } : {}),
      });
      return chrome.storage.local.set({
        library: {
          version: 1,
          entries: [entry(1, 'Alpha', 'Algebra'), entry(2, 'Beta', 'Statistics'), entry(3, 'Gamma', 'Statistics')],
        },
      });
    });
    await reloadPanel();
    await openMode('My library');
    const select = page.getByLabel('Category', { exact: true });
    await select.waitFor({ timeout: 5000 });
    const rows = page.locator('.library-row');
    check('the category filter lists every category once', (await select.locator('option').allTextContents()).join('|') === 'All categories|Algebra|Statistics');
    await select.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelectorAll('.library-row').length === 2);
    check('choosing a category from the keyboard narrows the list', (await rows.count()) === 2);
    await page.locator('#library-filter').fill('alpha');
    await page.waitForFunction(() => document.querySelectorAll('.library-row').length === 0);
    const emptyText = await page.locator('.library-panel .palette__empty').textContent();
    check('a category and search with no match say how to clear them', /clear the filters/.test(emptyText ?? ''), emptyText ?? '');
    await page.locator('#library-filter').fill('');
    await select.selectOption({ label: 'All categories' });
    await page.waitForFunction(() => document.querySelectorAll('.library-row').length === 3);
    check('All categories shows the whole library again', (await rows.count()) === 3);
    await page.evaluate(() => chrome.storage.local.remove('library'));
  });

  await section('speech data', async () => {
    // 7. Speech data is positively served from the extension itself: the SRE
    //    warm-up (an idle callback, at most ~2 s after load) must fetch its
    //    locale maps from the extension origin – the one asset with a remote
    //    default that would otherwise silently break the offline invariant.
    const sawLocalMathmaps = () => extensionRequests.some((url) => /\/sre\/mathmaps\/.+\.json$/.test(url));
    for (let waited = 0; !sawLocalMathmaps() && waited < 5000; waited += 250) {
      await page.waitForTimeout(250);
    }
    check('speech locale maps load from the extension origin', sawLocalMathmaps());
  });

  await section('errors and traffic', async () => {
    // 8. No genuine errors and no non-extension traffic during any of the above.
    check('no console or page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('no failed or external requests (offline invariant)', badRequests.length === 0, badRequests.slice(0, 3).join(' | '));
  });

  await page.close();
} catch (error) {
  failures++;
  console.error(`  FAIL  ${String(error?.message ?? error)}`);
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} extension smoke failure(s)`);
  process.exit(1);
}
console.log('\nAll extension smoke checks passed.');
