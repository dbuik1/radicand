/**
 * Accessibility audit runner: builds the real side panel, serves it, and runs
 * WCAG 2.2 AA checks – axe-core scans plus keyboard navigation, focus
 * visibility, target size, reflow, live regions and semantics.
 * Exits 0 when every violation is already listed in known-issues.json, and 1
 * when a new one appears.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, launchBrowser, openPanel } from './helpers.mjs';
import { viteBuild } from '../run-tool.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// ============================================================================
// Build and serve
// ============================================================================

console.log('Building a11y bundle...');
viteBuild(path.join(HERE, 'vite.config.ts'));

const server = await serveDist();
const browser = await launchBrowser();

console.log(`\nServing on ${server.url}`);

const findings = []; // { id, severity: 'violation'|'warning', detail }
const themes = ['light', 'dark', 'high-contrast'];

/**
 * Open a workspace mode the way a user does: through the Insert… menu on the
 * search row (Drawing, My library) or the More ▾ menu in the equation
 * header (Settings, Keyboard shortcuts). At the panel's width the menus are
 * the visible path; the plain From buttons only appear on a wide surface.
 */
async function openMode(page, menu, label) {
  await page.evaluate(
    ({ menu, label }) => {
      document
        .getElementById(`${menu}-trigger`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Match the item's label, not its whole text: an item that prints its
      // keyboard shortcut carries that too.
      const item = [...document.querySelectorAll(`#${menu}-menu [role="menuitem"]`)].find(
        (el) => (el.querySelector('.menu__label') ?? el).textContent.trim() === label,
      );
      item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },
    { menu, label },
  );
  await page.waitForTimeout(50);
  // A mode that did not open leaves the previous one on screen, and every
  // scan after that point would audit the wrong DOM – so fail here.
  const shown = await page.evaluate(
    (l) => document.querySelector('.mode:not([hidden]) .mode__title')?.textContent?.trim() === l,
    label,
  );
  if (!shown) throw new Error(`mode "${label}" did not open via #${menu}-menu`);
}

/** Click the visible button with exactly this text in the open mode. */
async function clickButton(page, text) {
  const clicked = await page.evaluate((t) => {
    const button = [...document.querySelectorAll('.mode:not([hidden]) button')].find(
      (el) => el.textContent.trim() === t && el.checkVisibility(),
    );
    button?.click();
    return Boolean(button);
  }, text);
  if (!clicked) throw new Error(`no visible "${text}" button in the open mode`);
  await page.waitForTimeout(50);
}

/** In an open Custom shortcuts mode with no shortcuts, add the common set. */
async function addCommonShortcuts(page) {
  const label = await page.evaluate(
    () =>
      [...document.querySelectorAll('.mode:not([hidden]) button')]
        .map((el) => el.textContent.trim())
        .find((t) => /^Add \d+ common shortcuts$/.test(t)) ?? '',
  );
  if (label === '') throw new Error('Custom shortcuts did not open on its empty state');
  await clickButton(page, label);
  await page.waitForSelector('.mode--customShortcuts .library-row__insert', { timeout: 5000 });
}

/**
 * Type `\su` into the equation field so the `\` finder opens under it. The
 * list is the field's own suggestion list, not a workspace mode, so it is
 * reached by typing rather than through a menu.
 */
async function openFinder(page) {
  await page.evaluate(() => {
    document.querySelector('math-field')?.focus();
  });
  await page.keyboard.press('Backslash');
  await page.waitForTimeout(80);
  for (const letter of ['s', 'u']) {
    await page.keyboard.press(letter);
    await page.waitForTimeout(60);
  }
  await page.waitForSelector('#command-finder-listbox [role="option"]', { timeout: 5000 });
}

/** Leave LaTeX mode and clear the field again (Escape closes the list first). */
async function closeFinder(page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    document.querySelector('math-field')?.setValue('');
  });
}

/** Pointer-draw a ∀ on the (already open) draw-to-find surface. */
async function drawForAll(page) {
  const box = await page.evaluate(() => {
    const rect = document.querySelector('.draw-find__surface')?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  });
  if (!box) return;
  const at = (fx, fy) => [box.x + 8 + fx * (box.width - 16), box.y + 8 + fy * (box.height - 16)];
  for (const stroke of [
    [[0.18, 0.06], [0.5, 0.92]],
    [[0.82, 0.06], [0.5, 0.92]],
    [[0.31, 0.45], [0.69, 0.45]],
  ]) {
    await page.mouse.move(...at(...stroke[0]));
    await page.mouse.down();
    await page.mouse.move(...at(...stroke[1]), { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  }
}

try {
  // =========================================================================
  // Check A: axe-core WCAG scans (per theme)
  // =========================================================================
  console.log('\n[A] axe-core WCAG 2.2 AA scans...');
  for (const theme of themes) {
    const page = await openPanel(browser, server.url, theme);
    const axePath = path.resolve(ROOT, 'node_modules/axe-core/axe.min.js');
    await page.addScriptTag({ path: axePath });

    // Each scan is labelled with the mode on screen, and the label is part of
    // every finding id: the same rule on the same selector in a different
    // mode is a different finding.
    const scan = (label) =>
      page
        .evaluate(async () =>
          axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          }),
        )
        .then((result) => ({ ...result, label }));

    // The workspace shows one mode at a time, so each mode is scanned in
    // turn. Symbols first, with the search combobox expanded so the audit
    // covers its open state (options, active-option highlight, aria wiring)
    // – its collapsed state is a strict subset.
    await page.evaluate(() => {
      const input = document.getElementById('symbol-search-input');
      input.value = 'integral';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForSelector('[role="option"]', { timeout: 10000 });
    const scans = [await scan('symbols')];

    // Then the `\` finder, open under the field with its suggestions shown.
    await openFinder(page);
    scans.push(await scan('finder'));
    await closeFinder(page);

    // Then Drawing: draw a ∀ so its candidate list renders, and unhide the
    // no-match text so both of its result states are in the scanned DOM.
    await openMode(page, 'from', 'Drawing');
    await drawForAll(page);
    await page.waitForSelector('.draw-find__option', { timeout: 10000 });
    await page.evaluate(() => {
      const block = document.querySelector('.draw-find__nomatch');
      if (block) block.hidden = false;
    });
    scans.push(await scan('drawing'));

    // Then the modes reached from More ▾, and My library.
    for (const [menu, label, scanLabel] of [
      ['from', 'My library', 'my-library'],
      ['more', 'Settings', 'settings'],
      ['more', 'Keyboard shortcuts', 'keyboard-shortcuts'],
    ]) {
      await openMode(page, menu, label);
      scans.push(await scan(scanLabel));
    }

    // Custom shortcuts in each of its states: empty (with the common set
    // shown), the list once the set is added, and the add form.
    await openMode(page, 'more', 'Custom shortcuts');
    scans.push(await scan('custom-shortcuts-empty'));
    await addCommonShortcuts(page);
    scans.push(await scan('custom-shortcuts-list'));
    await clickButton(page, 'Add shortcut');
    scans.push(await scan('custom-shortcuts-form'));
    await page.keyboard.press('Escape');
    // The import form with every note it can show: a trigger you already
    // have and a trigger the file repeats.
    await page.setInputFiles('.mode--customShortcuts input[type="file"]', {
      name: 'shortcuts.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          entries: [
            { trigger: 'al', latex: '\\alpha' },
            { trigger: 'zz', latex: '1' },
            { trigger: 'zz', latex: '2' },
          ],
        }),
      ),
    });
    await page.waitForSelector('input[name="shortcuts-import-repeats"]', { timeout: 5000 });
    scans.push(await scan('custom-shortcuts-import'));
    await page.keyboard.press('Escape');

    const results = {
      violations: scans.flatMap((r) => r.violations.map((v) => ({ ...v, scanLabel: r.label }))),
      incomplete: scans.flatMap((r) => r.incomplete),
    };

    // Process violations
    for (const violation of results.violations) {
      for (const node of violation.nodes) {
        const selector = node.target[0];
        // Classify by the node's HTML as well as its selector: the math-field
        // carries an id, so axe may report it as `#equation-editor`.
        const isMathlive =
          selector.includes('math-field') ||
          selector.includes('ML__') ||
          /<math-field|ML__/.test(node.html ?? '');
        const prefix = isMathlive ? 'axe-mathlive' : 'axe';
        const id = `${prefix}:${theme}:${violation.scanLabel}:${violation.id}:${selector}`;
        findings.push({
          id,
          severity: 'violation',
          detail: `${violation.id} (${selector}): ${violation.help} – ${node.failureSummary || 'See impact'}`,
        });
      }
    }

    console.log(`  ${theme}: ${results.violations.length} violations, ${results.incomplete.length} incomplete`);
    // "Incomplete" = axe could not decide automatically (e.g. contrast over a
    // gradient). Surface them as warnings so they get manual review, not silence.
    for (const item of results.incomplete) {
      const target = item.nodes[0]?.target?.join(',') ?? 'unknown';
      findings.push({
        id: `axe-incomplete:${theme}:${item.id}:${target}`,
        severity: 'warning',
        detail: `${item.id} needs manual review (${target}): ${item.help}`,
      });
    }
    await page.close();
  }

  // =========================================================================
  // Check B: keyboard tab-order walk (light theme)
  // =========================================================================
  console.log('\n[B] Keyboard tab-order walk...');
  const page = await openPanel(browser, server.url, 'light');

  // Collect all elements reached by Tab
  const tabOrder = [];
  const tabStates = [];
  let stuckCount = 0;
  let lastDescriptor = null;

  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const descriptor = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: el.className || '',
        text: ((el.getAttribute('aria-label') || el.textContent || '').trim()).slice(0, 40),
      };
    });

    if (!descriptor) break;

    // Check for cycle: if we return to the first element, stop
    if (tabOrder.length > 0) {
      const first = tabOrder[0];
      if (
        descriptor.tag === first.tag &&
        descriptor.id === first.id &&
        descriptor.className === first.className &&
        descriptor.text === first.text
      ) {
        console.log(`  Tab cycle detected at ${i} stops`);
        break;
      }
    }

    // Check for trap: same element 3 times → potential focus trap
    if (lastDescriptor && JSON.stringify(descriptor) === JSON.stringify(lastDescriptor)) {
      stuckCount++;
      if (stuckCount >= 3) {
        findings.push({
          id: 'keyboard:trap',
          severity: 'violation',
          detail: `Focus trap: activeElement unchanged after 3+ Tab presses at ${descriptor.text || descriptor.tag}`,
        });
        break;
      }
    } else {
      stuckCount = 0;
    }

    tabOrder.push(descriptor);
    lastDescriptor = descriptor;
  }

  console.log(`  Tab order: ${tabOrder.length} stops`);

  // The menus sit above the field and the actions toolbar below it, so the
  // walk from the skip link is Style ▾, More ▾, the field, the toolbar (its
  // one stop is Copy), then the workspace's search box, its Insert…
  // control and the first category tab, one stop each. The user guide and
  // the design record describe this sequence, so it is asserted as a sequence.
  // The recorded walk is one full cycle from wherever focus starts, so it
  // is read as a ring anchored on Style ▾.
  const EXPECTED_WALK = [
    'style-trigger',
    'more-trigger',
    'equation-editor',
    'copy-button',
    'symbol-search-input',
    'from-trigger',
    'palette-tab-0',
  ];
  const walkIds = tabOrder.map((el) => el.id || el.tag);
  const walkStart = walkIds.indexOf(EXPECTED_WALK[0]);
  const walkPrefix =
    walkStart === -1 ? [] : walkIds.concat(walkIds).slice(walkStart, walkStart + EXPECTED_WALK.length);
  if (walkPrefix.join(' → ') !== EXPECTED_WALK.join(' → ')) {
    findings.push({
      id: 'keyboard:walk-order',
      severity: 'violation',
      detail: `Tab walk from Style ▾ is ${walkPrefix.join(' → ') || '(Style ▾ not reached)'}; expected ${EXPECTED_WALK.join(' → ')}`,
    });
  } else {
    console.log(`  Tab walk from Style ▾: ${EXPECTED_WALK.join(' → ')}`);
  }

  // Assert required elements
  const skipLink = tabOrder.some((el) => el.className.includes('skip-link'));
  const mathField = tabOrder.some((el) => el.tag === 'math-field');
  // Palette tabs are the only role="tab" controls, and the tab-order walk
  // records class names rather than roles, so match on the class.
  const tabRole = tabOrder.some((el) => el.className.includes('palette__tab'));
  const textarea = tabOrder.some((el) => el.tag === 'textarea');
  const copyBtn = tabOrder.some((el) => el.text.toLowerCase().includes('copy'));
  // Speak shares the actions toolbar's one Tab stop: the arrow keys reach it.
  await page.focus('#copy-button');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const speakBtn = await page.evaluate(() => document.activeElement?.textContent.trim() === 'Speak');
  const styleMenu = tabOrder.some((el) => el.text.toLowerCase().includes('style'));
  const moreMenu = tabOrder.some((el) => el.text.toLowerCase().includes('more'));
  // Settings moved out of the workspace's Tab sequence and behind More ▾,
  // so what the walk must find here is the search box that opens Symbols.
  const searchBox = tabOrder.some((el) => el.id === 'symbol-search-input');

  if (!skipLink) {
    findings.push({
      id: 'keyboard:missing-skip-link',
      severity: 'violation',
      detail: 'Skip link not found in tab order',
    });
  }

  // The skip link lands on the workspace, which shows whichever mode is
  // open (Settings, My library, …), not always the symbols – so its text
  // must name the region it actually reaches.
  const skipTarget = await page.evaluate(() => {
    const link = document.querySelector('a.skip-link');
    const target = link ? document.querySelector(link.getAttribute('href')) : null;
    return {
      text: link?.textContent.trim() ?? '',
      targetLabel: target?.getAttribute('aria-label') ?? '',
    };
  });
  if (
    !skipTarget.targetLabel ||
    !skipTarget.text.toLowerCase().includes(skipTarget.targetLabel.toLowerCase())
  ) {
    findings.push({
      id: 'keyboard:skip-link-name',
      severity: 'violation',
      detail: `Skip link "${skipTarget.text}" does not name its target region "${skipTarget.targetLabel}"`,
    });
  } else {
    console.log(`  Skip link "${skipTarget.text}" names its target`);
  }
  if (!mathField) {
    findings.push({
      id: 'keyboard:missing-math-field',
      severity: 'violation',
      detail: 'math-field element not in tab order',
    });
  }
  if (!tabRole) {
    findings.push({
      id: 'keyboard:missing-tab-control',
      severity: 'violation',
      detail: 'No tab/palette control found in tab order',
    });
  }
  if (!textarea) {
    findings.push({
      id: 'keyboard:missing-textarea',
      severity: 'violation',
      detail: 'Textarea (source/LaTeX editor) not in tab order',
    });
  }
  if (!copyBtn) {
    findings.push({
      id: 'keyboard:missing-copy-button',
      severity: 'violation',
      detail: 'Copy button not found in tab order',
    });
  }
  if (!speakBtn) {
    findings.push({
      id: 'keyboard:missing-speak-button',
      severity: 'violation',
      detail: 'Speak button not reached with the arrow keys from Copy',
    });
  }
  if (!styleMenu) {
    findings.push({
      id: 'keyboard:missing-style-menu',
      severity: 'violation',
      detail: 'Style menu button not found in tab order',
    });
  }
  if (!moreMenu) {
    findings.push({
      id: 'keyboard:missing-more-menu',
      severity: 'violation',
      detail: 'More menu button not found in tab order',
    });
  }
  if (!searchBox) {
    findings.push({
      id: 'keyboard:missing-symbol-search',
      severity: 'violation',
      detail: 'Symbol search box not found in tab order',
    });
  }

  // Check for positive tabindex
  const positiveTabindex = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[tabindex]'));
    return els.filter((el) => {
      const ti = parseInt(el.getAttribute('tabindex'), 10);
      return ti > 0;
    }).map((el) => ({ tag: el.tagName, text: el.textContent.slice(0, 30) }));
  });
  if (positiveTabindex.length > 0) {
    findings.push({
      id: 'keyboard:positive-tabindex',
      severity: 'violation',
      detail: `${positiveTabindex.length} elements with tabindex > 0: ${JSON.stringify(positiveTabindex.slice(0, 3))}`,
    });
  }

  // Drawing, keyboard only: the surface takes a pointer, so the mode must
  // offer the text search before any ink exists – a reachable, enabled
  // "Search instead" control, and a surface whose description names the
  // shortcut.
  await openMode(page, 'from', 'Drawing');
  await page.waitForSelector('.draw-find__surface', { timeout: 5000 });
  await page.evaluate(() => document.querySelector('.draw-find__surface')?.focus());
  const drawingRoute = { reached: false, stops: [] };
  for (let i = 0; i < 6 && !drawingRoute.reached; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        text: (el?.textContent ?? '').trim().slice(0, 40),
        disabled: el instanceof HTMLButtonElement && el.disabled,
        insideDrawing: Boolean(el?.closest('#draw-region')),
      };
    });
    drawingRoute.stops.push(stop.text);
    if (stop.text.startsWith('Search instead') && stop.insideDrawing && !stop.disabled) {
      drawingRoute.reached = true;
    }
    if (!stop.insideDrawing) break;
  }
  const drawingDescription = await page.evaluate(() => {
    const surface = document.querySelector('.draw-find__surface');
    const description = document.getElementById(surface?.getAttribute('aria-describedby') ?? '');
    return {
      label: surface?.getAttribute('aria-label') ?? '',
      description: description?.textContent ?? '',
    };
  });
  if (!drawingRoute.reached) {
    findings.push({
      id: 'keyboard:drawing-search-route',
      severity: 'violation',
      detail: `Tab from the drawing surface reaches no enabled "Search instead" control before leaving the mode (stops: ${drawingRoute.stops.join(' → ') || 'none'})`,
    });
  } else if (!/Ctrl\+\/|Cmd\+\//.test(drawingDescription.description)) {
    findings.push({
      id: 'keyboard:drawing-search-shortcut',
      severity: 'violation',
      detail: `The drawing surface ("${drawingDescription.label}") is not described with the search shortcut; description: ${JSON.stringify(drawingDescription.description)}`,
    });
  } else {
    console.log(
      `  Drawing offers the text search by keyboard: "${drawingRoute.stops.at(-1)}" reached in ${drawingRoute.stops.length} Tab(s); surface described as ${JSON.stringify(drawingDescription.description)}`,
    );
  }
  await page.keyboard.press('Escape');

  // =========================================================================
  // Check C: focus visibility (per theme)
  // =========================================================================
  console.log('\n[C] Focus visibility...');

  const focusSelectors = [
    'a.skip-link',
    '.palette__tab',
    '.palette__btn',
    'button.btn',
    'select',
    'textarea',
    'math-field',
  ];

  // Drive focus with real Tab keypresses (programmatic .focus() does not set
  // :focus-visible, which would make every outline read as "none"). Every
  // element of interest is first read at rest, with nothing focused; then
  // one full Tab cycle reads each stop *while focused*, and an indicator
  // counts as visible only where the focused outline or box-shadow differs
  // from that element's own resting one – a decorative shadow that is there
  // all along is not a focus indicator.
  for (const theme of themes) {
    const focusPage = await openPanel(browser, server.url, theme);
    const resting = await focusPage.evaluate((selectors) => {
      document.activeElement?.blur?.();
      const styles = {};
      document.querySelectorAll(selectors.join(',')).forEach((el, index) => {
        el.dataset.focusProbe = `rest-${index}`;
        const style = getComputedStyle(el);
        styles[el.dataset.focusProbe] = {
          outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
          boxShadow: style.boxShadow,
        };
      });
      return styles;
    }, focusSelectors);

    const stops = []; // every matching Tab stop, in order
    let firstStop = null;
    for (let i = 0; i < 200; i++) {
      await focusPage.keyboard.press('Tab');
      const stop = await focusPage.evaluate((selectors) => {
        const el = document.activeElement;
        if (!el || el === document.body) return { key: 'body', match: null };
        // Every stop gets a stable key, so the cycle is detected by the
        // first stop coming round again, not by a count.
        if (!el.dataset.focusProbe) {
          window.__focusWalk = (window.__focusWalk ?? 0) + 1;
          el.dataset.focusProbe = `walk-${window.__focusWalk}`;
        }
        const key = el.dataset.focusProbe;
        const match = selectors.find((sel) => el.matches?.(sel));
        if (!match) return { key, match: null };
        const style = getComputedStyle(el);
        return {
          key,
          match,
          name: el.getAttribute('aria-label') || el.id || (el.textContent?.trim().slice(0, 30) ?? ''),
          style: {
            outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
            outlineDrawn: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
            boxShadow: style.boxShadow,
          },
        };
      }, focusSelectors);
      if (firstStop === null) firstStop = stop.key;
      else if (stop.key === firstStop) break;
      if (stop.match) stops.push(stop);
    }

    const seen = new Map(); // selector -> the stops that lacked an indicator
    for (const stop of stops) {
      const rest = resting[stop.key];
      const outlineShown = stop.style.outlineDrawn && (!rest || stop.style.outline !== rest.outline);
      const shadowShown = rest ? stop.style.boxShadow !== rest.boxShadow : stop.style.boxShadow !== 'none';
      const failing = seen.get(stop.match) ?? [];
      if (!outlineShown && !shadowShown) {
        failing.push(
          `${JSON.stringify(stop.name)}: focused outline ${stop.style.outline}, box-shadow ${stop.style.boxShadow}` +
            (rest ? ` – at rest outline ${rest.outline}, box-shadow ${rest.boxShadow}` : ''),
        );
      }
      seen.set(stop.match, failing);
    }

    for (const [selector, failing] of seen) {
      if (failing.length > 0) {
        findings.push({
          id: `focus-visible:${theme}:${selector}`,
          severity: 'violation',
          detail: `No focus indicator distinct from the resting style on ${failing.length} ${selector} stop(s) reached by Tab: ${failing.join('; ')}`,
        });
      }
    }
    for (const selector of focusSelectors) {
      if (!seen.has(selector)) {
        findings.push({
          id: `focus-reach:${theme}:${selector}`,
          severity: 'warning',
          detail: `${selector} was not reached within one Tab cycle – verify focus styling manually`,
        });
      }
    }

    await focusPage.close();
  }

  // =========================================================================
  // Check D: target size, WCAG 2.5.8 (light theme)
  // =========================================================================
  console.log('\n[D] Target size (WCAG 2.5.8)...');
  const targetPage = await openPanel(browser, server.url, 'light');

  // Measure only elements that are actually rendered (checkVisibility handles
  // display:none ancestors, e.g. hidden tab panels, which children's own
  // computed display does not reveal). To cover controls that live in hidden
  // states, we activate each palette tab (and the matrix picker popover) and
  // measure while visible.
  const measureVisibleTargets = () =>
    targetPage.evaluate(() => {
      const interactive = Array.from(
        document.querySelectorAll('button, select, input, a, [role="tab"], summary'),
      );
      const small = [];
      for (const el of interactive) {
        if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue; // not rendered
        if (rect.width < 24 || rect.height < 24) {
          const shortSelector = `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
          small.push({
            selector: shortSelector,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
      return small;
    });

  const smallById = new Map();
  const record = (targets) => {
    for (const target of targets) {
      const id = `target-size:${target.selector}`;
      if (!smallById.has(id)) {
        smallById.set(id, `${target.selector}: ${target.width}x${target.height}px (min 24x24)`);
      }
    }
  };

  // Initial (Recent tab) state, then every palette tab, then the matrix picker.
  record(await measureVisibleTargets());
  const tabCount = await targetPage.evaluate(() => document.querySelectorAll('[role="tab"]').length);
  for (let i = 0; i < tabCount; i++) {
    await targetPage.evaluate((index) => {
      document.querySelectorAll('[role="tab"]')[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, i);
    await targetPage.waitForTimeout(50);
    record(await measureVisibleTargets());
    // Inside the Matrix tab, also open the size-picker popover and measure it.
    const openedPicker = await targetPage.evaluate(() => {
      const trigger = document.querySelector('.matrix-picker__trigger');
      if (!trigger || (typeof trigger.checkVisibility === 'function' && !trigger.checkVisibility())) return false;
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });
    if (openedPicker) {
      await targetPage.waitForTimeout(50);
      record(await measureVisibleTargets());
    }
  }
  // Open Drawing, draw a ∀ so the candidate rows (and the now-enabled
  // Undo/Clear) are measured; Search instead is measured with them.
  await openMode(targetPage, 'from', 'Drawing');
  await drawForAll(targetPage);
  await targetPage.waitForSelector('.draw-find__option', { timeout: 10000 });
  await targetPage.evaluate(() => {
    const block = document.querySelector('.draw-find__nomatch');
    if (block) block.hidden = false;
  });
  await targetPage.waitForTimeout(50);
  record(await measureVisibleTargets());
  // Then the remaining modes, whose controls are only rendered while open.
  for (const [menu, label] of [
    ['from', 'My library'],
    ['more', 'Settings'],
    ['more', 'Keyboard shortcuts'],
  ]) {
    await openMode(targetPage, menu, label);
    record(await measureVisibleTargets());
  }
  await openMode(targetPage, 'more', 'Custom shortcuts');
  record(await measureVisibleTargets());
  await addCommonShortcuts(targetPage);
  record(await measureVisibleTargets());
  await clickButton(targetPage, 'Add shortcut');
  record(await measureVisibleTargets());
  await targetPage.keyboard.press('Escape');

  for (const [id, detail] of smallById) {
    findings.push({ id, severity: 'violation', detail });
  }

  if (smallById.size > 0) {
    console.log(`  Found ${smallById.size} distinct targets below 24x24px`);
  } else {
    console.log(`  All interactive targets meet 24x24px minimum`);
  }

  // =========================================================================
  // Check E: reflow, WCAG 1.4.10 (light theme)
  // =========================================================================
  console.log('\n[E] Reflow (WCAG 1.4.10)...');
  const reflowPage = await openPanel(browser, server.url, 'light');
  await reflowPage.setViewportSize({ width: 320, height: 800 });
  await reflowPage.waitForTimeout(300);

  const scrollWidth = await reflowPage.evaluate(() => document.scrollingElement?.scrollWidth || 0);
  if (scrollWidth > 322) {
    findings.push({
      id: 'reflow:horizontal-scroll',
      severity: 'violation',
      detail: `Page scrollWidth ${scrollWidth}px exceeds 320px viewport`,
    });
  } else {
    console.log(`  No horizontal scrolling at 320px viewport`);
  }

  // The `\` finder is the widest thing that can open under the field (a row
  // of glyph, name and command), so it is measured at 320px as well – and it
  // must be fully on screen, not clipped by the panel edge.
  await openFinder(reflowPage);
  const finder = await reflowPage.evaluate(() => {
    const rect = document.querySelector('#command-finder-listbox')?.getBoundingClientRect();
    return {
      scrollWidth: document.scrollingElement?.scrollWidth || 0,
      right: rect ? rect.right : 0,
      left: rect ? rect.left : 0,
    };
  });
  if (finder.scrollWidth > 322 || finder.right > 322 || finder.left < 0) {
    findings.push({
      id: 'reflow:finder-clipped',
      severity: 'violation',
      detail: `With the \\ finder open: scrollWidth ${finder.scrollWidth}px, list spans ${finder.left}–${finder.right}px in a 320px viewport`,
    });
  } else {
    console.log('  The \\ finder fits at 320px viewport');
  }
  await closeFinder(reflowPage);

  // The panel's own font-size setting scales the root up to 24px, and every
  // mode must still fit 320px at each step: the equation header (heading +
  // Style ▾ + More ▾) and the Keyboard shortcuts key chips are the widest
  // rows. The scale is applied the way the setting applies it – the root
  // custom property – so the check does not depend on Settings being open.
  const fontScales = [
    ['Small', 16 / 18],
    ['Medium', 1],
    ['Large', 20 / 18],
    ['Larger', 22 / 18],
    ['Largest', 24 / 18],
  ];
  const reflowModes = [
    ['symbols', null, null],
    ['Settings', 'more', 'Settings'],
    ['Keyboard shortcuts', 'more', 'Keyboard shortcuts'],
    ['My library', 'from', 'My library'],
    // Empty first (the common set's grid), then the list, then the form.
    ['Custom shortcuts', 'more', 'Custom shortcuts'],
    ['Custom shortcuts list', 'more', 'Custom shortcuts', addCommonShortcuts],
    ['Custom shortcuts form', 'more', 'Custom shortcuts', (page) => clickButton(page, 'Add shortcut')],
  ];
  const scaleOverflows = [];
  for (const [modeName, menu, label, prepare] of reflowModes) {
    if (menu) await openMode(reflowPage, menu, label);
    if (prepare) await prepare(reflowPage);
    for (const [scaleName, scale] of fontScales) {
      await reflowPage.evaluate((value) => {
        document.documentElement.style.setProperty('--font-size-scale', String(value));
      }, scale);
      await reflowPage.waitForTimeout(80);
      const measured = await reflowPage.evaluate(() => {
        // A row that scrolls sideways inside its own box (the category
        // strip) is content designed to scroll, not page overflow.
        const scrollsWithin = (el) => {
          for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
            const overflowX = getComputedStyle(node).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll') return true;
          }
          return false;
        };
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => el.getClientRects().length > 0 && !scrollsWithin(el))
          .map((el) => ({ el, right: el.getBoundingClientRect().right }))
          .filter(({ right }) => right > 322)
          .map(({ el, right }) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(right)}`);
        return { scrollWidth: document.scrollingElement?.scrollWidth || 0, wide: wide.slice(0, 4) };
      });
      if (measured.scrollWidth > 322 || measured.wide.length > 0) {
        scaleOverflows.push(
          `${modeName} at ${scaleName}: scrollWidth ${measured.scrollWidth}px${measured.wide.length ? ` (${measured.wide.join(', ')})` : ''}`,
        );
      }
    }
    if (menu) await reflowPage.keyboard.press('Escape');
  }
  await reflowPage.evaluate(() => {
    document.documentElement.style.removeProperty('--font-size-scale');
  });
  if (scaleOverflows.length > 0) {
    findings.push({
      id: 'reflow:font-size-scale',
      severity: 'violation',
      detail: `Horizontal overflow at 320px under the font-size setting – ${scaleOverflows.join('; ')}`,
    });
  } else {
    console.log(`  No horizontal scrolling at 320px in ${reflowModes.length} modes across ${fontScales.length} font sizes`);
  }

  // =========================================================================
  // Check F: live regions + announcements (light theme)
  // =========================================================================
  console.log('\n[F] Live regions and announcements...');
  const liveRegionPage = await openPanel(browser, server.url, 'light');

  const liveRegions = await liveRegionPage.evaluate(() => {
    const status = document.querySelector('#sr-status');
    const alert = document.querySelector('#sr-alert');
    return {
      statusExists: !!status,
      statusRole: status?.getAttribute('role'),
      alertExists: !!alert,
      alertRole: alert?.getAttribute('role'),
    };
  });

  if (!liveRegions.statusExists || liveRegions.statusRole !== 'status') {
    findings.push({
      id: 'announce:missing-status',
      severity: 'violation',
      detail: '#sr-status with role=status not found',
    });
  }
  if (!liveRegions.alertExists || liveRegions.alertRole !== 'alert') {
    findings.push({
      id: 'announce:missing-alert',
      severity: 'violation',
      detail: '#sr-alert with role=alert not found',
    });
  }

  // Try to trigger a palette button click and listen for announcement
  const firstPaletteBtn = await liveRegionPage.evaluate(() => {
    const btn = document.querySelector('.palette__btn');
    return btn ? btn.textContent.slice(0, 30) : null;
  });

  if (firstPaletteBtn) {
    await liveRegionPage.click('.palette__btn');
    let announced = false;
    for (let i = 0; i < 10; i++) {
      const status = await liveRegionPage.evaluate(() => {
        const el = document.querySelector('#sr-status');
        return el?.textContent || '';
      });
      if (status.toLowerCase().includes('inserted')) {
        announced = true;
        console.log(`  Palette insertion announced: "${status}"`);
        break;
      }
      await liveRegionPage.waitForTimeout(100);
    }
    if (!announced) {
      findings.push({
        id: 'announce:palette-insert',
        severity: 'warning',
        detail: 'Palette insertion not announced within 1s',
      });
    }
  }

  // Copy is the panel's primary action and the live region is visually
  // hidden, so its result must also land in text a sighted user can see:
  // an on-screen element (outside .visually-hidden) reading "Copied as …",
  // from the button and from the Alt+C shortcut alike.
  await liveRegionPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const visibleCopyText = () =>
    liveRegionPage.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => !el.closest('.visually-hidden') && el.getClientRects().length > 0)
        .filter((el) => el.childElementCount === 0 && (el.textContent || '').includes('Copied as'))
        .map((el) => el.textContent.trim()),
    );
  const copyPaths = [
    ['Copy button', () => liveRegionPage.click('.copy-split__main')],
    ['Alt+C', () => liveRegionPage.keyboard.press('Alt+C')],
  ];
  for (const [pathName, activate] of copyPaths) {
    await liveRegionPage.evaluate(() => document.querySelector('math-field')?.setValue('x+1'));
    await liveRegionPage.waitForTimeout(3200); // any earlier confirmation has idled
    await liveRegionPage.evaluate(() => document.querySelector('math-field')?.focus());
    await activate();
    let seen = [];
    for (let i = 0; i < 10 && seen.length === 0; i++) {
      await liveRegionPage.waitForTimeout(100);
      seen = await visibleCopyText();
    }
    if (seen.length === 0) {
      findings.push({
        id: `copy:visible-confirmation:${pathName}`,
        severity: 'violation',
        detail: `${pathName}: no on-screen text reads "Copied as …" within 1s of copying`,
      });
    } else {
      console.log(`  ${pathName}: on-screen confirmation "${seen[0]}"`);
    }
  }
  await liveRegionPage.evaluate(() => document.querySelector('math-field')?.setValue(''));

  // My library, keyboard only: the list is rebuilt around the focused row on
  // every change, so focus must survive Insert (a second Enter inserts
  // again), Save changes and Undo, and typing in the filter must be audible.
  await openMode(liveRegionPage, 'from', 'My library');
  await liveRegionPage.evaluate(() => {
    [...document.querySelectorAll('.library-panel__tools button')]
      .find((button) => button.textContent.startsWith('Add starter'))
      ?.click();
  });
  await liveRegionPage.waitForSelector('.library-row__insert', { timeout: 5000 });
  const libraryFocusOk = [];
  const expectLibraryFocus = async (step, expected) => {
    const active = await liveRegionPage.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      return [...el.classList].find((name) => name.startsWith('library-row__')) ?? el.tagName.toLowerCase();
    });
    if (active === expected) {
      libraryFocusOk.push(step);
    } else {
      findings.push({
        id: `focus:library-${step}`,
        severity: 'violation',
        detail: `After ${step} in My library, focus is on ${active}; expected ${expected}`,
      });
    }
  };
  await liveRegionPage.evaluate(() => document.querySelector('.library-row__insert').focus());
  await liveRegionPage.keyboard.press('Enter');
  await liveRegionPage.waitForTimeout(150);
  await expectLibraryFocus('insert', 'library-row__insert');
  await liveRegionPage.evaluate(() => document.querySelector('.library-row__edit').focus());
  await liveRegionPage.keyboard.press('Enter');
  await liveRegionPage.waitForSelector('.library-form input', { timeout: 5000 });
  await liveRegionPage.keyboard.press('Enter'); // Enter in Name saves the changes
  await liveRegionPage.waitForTimeout(150);
  await expectLibraryFocus('save', 'library-row__edit');
  await liveRegionPage.keyboard.press('Enter'); // reopen Edit from its button
  await liveRegionPage.waitForSelector('.library-form .btn--danger', { timeout: 5000 });
  await liveRegionPage.evaluate(() => document.querySelector('.library-form .btn--danger').focus());
  await liveRegionPage.keyboard.press('Enter'); // arm
  await liveRegionPage.keyboard.press('Enter'); // delete: focus lands on Undo
  await liveRegionPage.waitForTimeout(150);
  await liveRegionPage.keyboard.press('Enter'); // undo
  await liveRegionPage.waitForTimeout(150);
  await expectLibraryFocus('undo', 'library-row__insert');
  if (libraryFocusOk.length > 0) {
    console.log(`  My library keeps keyboard focus through: ${libraryFocusOk.join(', ')}`);
  }

  // Form and rows sit on the page: the Save/Edit form has no box of its own
  // (its preview is the one filled surface), and each library row is a
  // plain name-over-preview line between the list's two hairlines. A
  // border or fill creeping back onto either is the "cards inside cards"
  // look the design rules out.
  await liveRegionPage.evaluate(() => document.querySelector('.library-row__edit')?.click());
  await liveRegionPage.waitForSelector('.library-form', { timeout: 5000 });
  const libraryChrome = await liveRegionPage.evaluate(() => {
    const style = (selector) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el) : null;
    };
    const form = style('.library-form');
    const preview = style('.library-form__preview');
    const row = style('.library-row__insert');
    const list = style('.library-panel__list');
    const name = document.querySelector('.library-row__name');
    const previewLine = document.querySelector('.library-row__preview');
    return {
      formBoxed: !form || form.borderTopStyle !== 'none' || form.backgroundColor !== 'rgba(0, 0, 0, 0)',
      previewBordered: !preview || preview.borderTopStyle !== 'none',
      rowBoxed: !row || row.borderTopStyle !== 'none' || row.backgroundColor !== 'rgba(0, 0, 0, 0)',
      listHairlines: Boolean(list) && list.borderTopStyle === 'solid' && list.borderBottomStyle === 'solid',
      stacked:
        Boolean(name && previewLine) &&
        name.getBoundingClientRect().bottom <= previewLine.getBoundingClientRect().top + 1,
    };
  });
  const chromeProblems = [
    libraryChrome.formBoxed && 'the form has a border or fill',
    libraryChrome.previewBordered && 'the form preview has a border',
    libraryChrome.rowBoxed && 'a library row has a border or fill',
    !libraryChrome.listHairlines && 'the list is missing its top or bottom hairline',
    !libraryChrome.stacked && 'a row does not stack the name over its preview',
  ].filter(Boolean);
  if (chromeProblems.length > 0) {
    findings.push({
      id: 'fidelity:library-chrome',
      severity: 'violation',
      detail: `My library and its form are boxed: ${chromeProblems.join('; ')}`,
    });
  } else {
    console.log('  My library form and rows sit on the page: no borders or fills beyond the preview');
  }
  await liveRegionPage.keyboard.press('Escape'); // close the Edit form
  await liveRegionPage.waitForTimeout(100);

  await liveRegionPage.evaluate(() => {
    document.querySelector('#sr-status').textContent = '';
    document.getElementById('library-filter').focus();
  });
  await liveRegionPage.keyboard.type('Quad');
  let filterAnnounced = '';
  for (let i = 0; i < 15 && !filterAnnounced; i++) {
    await liveRegionPage.waitForTimeout(100);
    filterAnnounced = await liveRegionPage.evaluate(
      () => document.querySelector('#sr-status')?.textContent || '',
    );
  }
  if (/formula/.test(filterAnnounced)) {
    console.log(`  Library filter announced: "${filterAnnounced}"`);
  } else {
    findings.push({
      id: 'announce:library-filter',
      severity: 'violation',
      detail: `Typing in the library filter announced ${JSON.stringify(filterAnnounced)} within 1.5s; expected a match count`,
    });
  }

  // Custom shortcuts, keyboard only: from the empty state, add a shortcut
  // through the form, insert it, delete it and undo, then Escape back to
  // the field – focus must land somewhere sensible after every step.
  await liveRegionPage.keyboard.press('Escape');
  // Closing a mode focuses the field a frame later; let that land first.
  await liveRegionPage.waitForTimeout(150);
  await openMode(liveRegionPage, 'more', 'Custom shortcuts');
  const shortcutFocusOk = [];
  const expectShortcutFocus = async (step, expected) => {
    const active = await liveRegionPage.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      if (el.tagName === 'MATH-FIELD') return 'field';
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null;
      return label ?? [...el.classList].find((name) => name.startsWith('library-row__')) ?? el.textContent.trim();
    });
    if (active === expected) {
      shortcutFocusOk.push(step);
    } else {
      findings.push({
        id: `focus:shortcuts-${step}`,
        severity: 'violation',
        detail: `After ${step} in Custom shortcuts, focus is on ${active}; expected ${expected}`,
      });
    }
  };
  await expectShortcutFocus('open', 'Add shortcut');
  await liveRegionPage.keyboard.press('Enter');
  await liveRegionPage.waitForTimeout(100);
  await expectShortcutFocus('add', 'Trigger');
  await liveRegionPage.keyboard.type('vareps');
  await liveRegionPage.keyboard.press('Tab');
  await liveRegionPage.keyboard.type('\\varepsilon');
  await liveRegionPage.keyboard.press('Tab'); // Blank out selection
  await liveRegionPage.keyboard.press('Tab');
  await expectShortcutFocus('tab-to-name', 'Name');
  await liveRegionPage.keyboard.type('Epsilon');
  await liveRegionPage.keyboard.press('Enter'); // save
  await liveRegionPage.waitForTimeout(150);
  await expectShortcutFocus('save', 'library-row__insert');
  await liveRegionPage.keyboard.press('Enter'); // insert, focus stays
  await liveRegionPage.waitForTimeout(150);
  await expectShortcutFocus('insert', 'library-row__insert');
  await liveRegionPage.keyboard.press('ArrowRight');
  await liveRegionPage.keyboard.press('Enter'); // Edit
  await liveRegionPage.waitForSelector('.mode--customShortcuts .btn--danger', { timeout: 5000 });
  await liveRegionPage.evaluate(() => document.querySelector('.mode--customShortcuts .btn--danger').focus());
  await liveRegionPage.keyboard.press('Enter'); // arm
  await liveRegionPage.keyboard.press('Enter'); // delete: focus lands on Undo
  await liveRegionPage.waitForTimeout(150);
  await expectShortcutFocus('delete', 'Undo delete of vareps');
  await liveRegionPage.keyboard.press('Enter'); // undo
  await liveRegionPage.waitForTimeout(150);
  await expectShortcutFocus('undo', 'library-row__insert');
  await liveRegionPage.keyboard.press('Escape');
  await liveRegionPage.waitForTimeout(100);
  await expectShortcutFocus('escape', 'field');
  if (shortcutFocusOk.length > 0) {
    console.log(`  Custom shortcuts keeps keyboard focus through: ${shortcutFocusOk.join(', ')}`);
  }

  // =========================================================================
  // Check G: names and headings (light theme)
  // =========================================================================
  console.log('\n[G] Accessible names and headings...');
  const namesPage = await openPanel(browser, server.url, 'light');

  // Check for accessible names
  const elementsWithoutNames = await namesPage.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll('button, select, textarea, a')
    );
    const missing = [];
    for (const el of els) {
      const style = getComputedStyle(el);
      if (style.display === 'none') continue;

      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledby = el.getAttribute('aria-labelledby');
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      const text = (el.textContent || '').trim();

      if (!ariaLabel && !ariaLabelledby && !label && !text) {
        const shortSel = `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`;
        missing.push(shortSel);
      }
    }
    return missing;
  });

  if (elementsWithoutNames.length > 0) {
    const unique = [...new Set(elementsWithoutNames)];
    findings.push({
      id: 'name:missing-accessible-name',
      severity: 'violation',
      detail: `${unique.length} elements without accessible names: ${unique.slice(0, 10).join(', ')}`,
    });
  }

  // Check heading order
  const headings = await namesPage.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => {
      const level = parseInt(h.tagName[1], 10);
      return { level, text: h.textContent.slice(0, 30) };
    });
  });

  let headingError = false;
  if (headings.length > 0 && headings[0].level !== 1) {
    findings.push({
      id: 'headings:no-h1',
      severity: 'violation',
      detail: 'No h1 heading found',
    });
    headingError = true;
  }

  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;
    if (curr - prev > 1) {
      findings.push({
        id: 'headings:order',
        severity: 'violation',
        detail: `Heading level skip: h${prev} followed by h${curr}`,
      });
      headingError = true;
      break;
    }
  }

  if (!headingError && headings.length > 0) {
    console.log(`  Heading structure OK: ${headings.map((h) => `h${h.level}`).join(' → ')}`);
  }

  await namesPage.close();

  // =========================================================================
  // Load known-issues, filter, and report
  // =========================================================================
  const knownIssuesPath = path.join(HERE, 'known-issues.json');
  let knownIds = [];
  if (fs.existsSync(knownIssuesPath)) {
    const content = fs.readFileSync(knownIssuesPath, 'utf8');
    const issues = JSON.parse(content);
    knownIds = issues.map((i) => i.id);
  }

  const violations = findings.filter((f) => f.severity === 'violation');
  const warnings = findings.filter((f) => f.severity === 'warning');

  const unknownViolations = violations.filter((f) => !knownIds.includes(f.id));
  const knownViolations = violations.filter((f) => knownIds.includes(f.id));
  // A known issue the run no longer reports is fixed or renamed: either way
  // its entry must go, or the file silently stops matching what it excuses.
  const staleKnownIds = knownIds.filter((id) => !violations.some((f) => f.id === id));

  console.log('\n' + '='.repeat(78));
  console.log('AUDIT FINDINGS');
  console.log('='.repeat(78));

  if (knownViolations.length > 0) {
    console.log(`\n[KNOWN] ${knownViolations.length} known issues:\n`);
    for (const f of knownViolations) {
      console.log(`  ✓ ${f.id}`);
      console.log(`    ${f.detail}`);
    }
  }

  if (staleKnownIds.length > 0) {
    console.log(`\n[STALE] ${staleKnownIds.length} known issues no longer reported – remove them from known-issues.json:\n`);
    for (const id of staleKnownIds) {
      console.log(`  ✗ ${id}`);
    }
  }

  if (unknownViolations.length > 0) {
    console.log(`\n[FAIL] ${unknownViolations.length} new violations:\n`);
    for (const f of unknownViolations) {
      console.log(`  ✗ ${f.id}`);
      console.log(`    ${f.detail}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n[WARN] ${warnings.length} warnings:\n`);
    for (const f of warnings) {
      console.log(`  ⚠ ${f.id}`);
      console.log(`    ${f.detail}`);
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log('SUMMARY');
  console.log('='.repeat(78));
  console.log(`  Total findings: ${findings.length}`);
  console.log(`    - Violations: ${violations.length} (${knownViolations.length} known, ${unknownViolations.length} new)`);
  console.log(`    - Stale known issues: ${staleKnownIds.length}`);
  console.log(`    - Warnings: ${warnings.length}`);

  // Count by check
  const byCheck = {};
  for (const f of findings) {
    const check = f.id.split(':')[0];
    byCheck[check] = (byCheck[check] || 0) + 1;
  }
  console.log(`\n  By check:`);
  for (const [check, count] of Object.entries(byCheck).sort()) {
    console.log(`    ${check}: ${count}`);
  }

  // Count by theme
  const byTheme = {};
  for (const f of findings) {
    const match = f.id.match(/:(light|dark|high-contrast):/);
    if (match) {
      const theme = match[1];
      byTheme[theme] = (byTheme[theme] || 0) + 1;
    }
  }
  if (Object.keys(byTheme).length > 0) {
    console.log(`\n  By theme:`);
    for (const [theme, count] of Object.entries(byTheme).sort()) {
      console.log(`    ${theme}: ${count}`);
    }
  }

  console.log('');

  if (unknownViolations.length > 0 || staleKnownIds.length > 0) {
    // exitCode (not process.exit) so the finally block still closes the
    // browser and server before the process ends.
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
