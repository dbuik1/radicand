/**
 * Generate the Chrome Web Store images: five 1280×800 screenshots, the
 * 440×280 small promo tile and the 1400×560 marquee, into docs/store/.
 *
 * Every image is one plate in a series. A large radical sign runs up the
 * left edge and its bar across the top, so the content is the radicand; the
 * number in the crook of the sign (where a root's index goes) is the plate
 * number. Headlines and the specimen beside each panel are set in the
 * bundled STIX Two Math, the face of the R in the icon.
 *
 * The panel shots come from the built extension in `dist/` loaded into
 * Chromium, so run `npm run build` first. Nothing is fetched.
 * Run: node scripts/generate-store-images.mjs
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchExtensionContext } from '../tests/launch-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs', 'store');
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
const fontFile = (pattern) => {
  const name = readdirSync(path.join(DIST, 'assets')).find((file) => pattern.test(file));
  if (!name) throw new Error(`no built font matching ${pattern}`);
  return readFileSync(path.join(DIST, 'assets', name)).toString('base64');
};
const FONTS = `
  @font-face { font-family: 'STIX Two Math'; src: url(data:font/woff2;base64,${fontFile(/^STIXTwoMath.*\.woff2$/)}) format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 100 900; src: url(data:font/woff2;base64,${fontFile(/^Inter-latin-(?!ext).*\.woff2$/)}) format('woff2'); }
`;

// The panel is shown at the width Chrome gives a side panel by default, and
// at the height that fits under the bar of the sign.
const PANEL = { width: 400, height: 624 };
const QUADRATIC = 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}';
const GAUSSIAN = '\\int_0^{\\infty}e^{-x^2}\\,dx=\\frac{\\sqrt{\\pi}}{2}';

// The two grounds: the brand's ink with its dark-theme blue, and the
// high-contrast theme's black with its yellow.
const INK = { ground: '#0e1a2e', line: '#5aabff', text: '#f4f7fc', muted: '#c3cde0', faint: 'rgb(244 247 252 / 0.14)',
  sheet: '#f4f7fc', sheetText: '#14233c', grid: 'rgb(90 171 255 / 0.055)' };
const CONTRAST = { ground: '#000000', line: '#ffd60a', text: '#ffffff', muted: '#ffffff', faint: 'rgb(255 255 255 / 0.4)',
  sheet: '#000000', sheetText: '#ffffff', grid: 'rgb(255 214 10 / 0.07)' };

const BASE_CSS = `
  ${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { overflow: hidden; position: relative; font-family: 'Inter', sans-serif; }
  .radical { position: absolute; inset: 0; }
  .serif, math { font-family: 'STIX Two Math', serif; }
  .mono { font-family: ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace; }
`;

const QUADRATIC_MATHML = `<math display="block"><mi>x</mi><mo>=</mo><mfrac><mrow><mo>−</mo><mi>b</mi><mo>±</mo><msqrt><msup><mi>b</mi><mn>2</mn></msup><mo>−</mo><mn>4</mn><mi>a</mi><mi>c</mi></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></math>`;

const userDataDir = mkdtempSync(path.join(tmpdir(), 'store-images-'));
const context = await launchExtensionContext(DIST, userDataDir);

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const panelUrl = `chrome-extension://${new URL(worker.url()).host}/${manifest.side_panel.default_path}`;

  const panel = await context.newPage();
  await panel.setViewportSize(PANEL);
  await panel.goto(panelUrl);
  await panel.waitForSelector('math-field');
  await panel.waitForTimeout(800);

  const setEquation = (latex) =>
    panel.evaluate((value) => document.querySelector('math-field').setValue(value), latex);
  const openTab = async (mode) => {
    await panel.evaluate((id) => document.getElementById(id)?.click(), `tab-${mode}`);
    await panel.waitForSelector(`#panel-${mode}:not([hidden])`, { timeout: 5000 });
  };
  const shoot = async ({ keepFocus = false } = {}) => {
    // Nothing focused, so no focus ring or caret lands in the picture –
    // except where the focus is what shows the feature.
    if (!keepFocus) await panel.evaluate(() => document.activeElement?.blur());
    await panel.waitForTimeout(250);
    return (await panel.screenshot()).toString('base64');
  };

  // The source disclosure sits where the panel is cropped, so it is
  // switched off in Settings for the pictures.
  await panel.evaluate(() => {
    document.getElementById('settings-trigger')?.click();
    document.getElementById('set-part-source')?.click();
  });
  await panel.keyboard.press('Escape');

  // 1. The quadratic formula in the field, mid-edit.
  await setEquation(QUADRATIC);
  const editing = await shoot({ keepFocus: true });

  // 2. Searching for a symbol by meaning.
  await setEquation('c^2=a^2+b^2-2ab\\cos');
  await panel.fill('.symbol-search__input', 'angle');
  await panel.waitForSelector('.symbol-search__list [role="option"]', { timeout: 5000 });
  const angle = await panel.evaluate(() =>
    [...document.querySelectorAll('.symbol-search__list [role="option"]')].findIndex((o) =>
      o.textContent.includes('\\angle'),
    ),
  );
  for (let i = 0; i < angle; i += 1) await panel.press('.symbol-search__input', 'ArrowDown');
  // Moving through the list scrolls the panel and leaves the search label
  // cut in half: scroll on until the box itself is the first thing shown.
  await panel.evaluate(() => {
    const input = document.querySelector('.symbol-search__input');
    const fixedBottom = document.querySelector('.actions-bar').getBoundingClientRect().bottom;
    for (let el = input.parentElement; el; el = el.parentElement) {
      if (el.scrollTop > 0) el.scrollTop += input.getBoundingClientRect().top - fixedBottom - 6;
    }
  });
  await panel.waitForTimeout(200);
  const searching = await shoot({ keepFocus: true });
  await panel.fill('.symbol-search__input', '');

  // 3. A drawn ∀ and its matches.
  await setEquation('');
  await openTab('drawing');
  const box = await panel.evaluate(() => {
    const r = document.querySelector('.draw-find__surface').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const at = (fx, fy) => [box.x + 8 + fx * (box.width - 16), box.y + 8 + fy * (box.height - 16)];
  for (const [from, to] of [
    [[0.3, 0.12], [0.5, 0.88]],
    [[0.7, 0.12], [0.5, 0.88]],
    [[0.37, 0.48], [0.63, 0.48]],
  ]) {
    await panel.mouse.move(...at(...from));
    await panel.mouse.down();
    await panel.mouse.move(...at(...to), { steps: 12 });
    await panel.mouse.up();
    await panel.waitForTimeout(150);
  }
  await panel.waitForSelector('.draw-find__option', { timeout: 10000 });
  const drawing = await shoot();
  await openTab('symbols');

  // 4. The library with the starter formulae.
  await setEquation(QUADRATIC);
  await openTab('library');
  await panel.evaluate(() => {
    [...document.querySelectorAll('.mode:not([hidden]) button')]
      .find((b) => b.textContent.trim() === 'Add starter formulae')
      ?.click();
  });
  await panel.waitForSelector('.library-row__insert', { timeout: 5000 });
  // The confirmation line clears by itself; the picture is of the list.
  await panel.waitForSelector('.actions-bar__status', { state: 'hidden', timeout: 10000 });
  const library = await shoot();
  await openTab('symbols');

  // 5. The high-contrast theme, and the words Read aloud says for its
  // equation: the synthesiser is replaced so the text can be read back.
  await setEquation(GAUSSIAN);
  await panel.evaluate(() => {
    document.documentElement.dataset.theme = 'high-contrast';
  });
  const contrast = await shoot();
  const spoken = await panel.evaluate(async () => {
    const heard = new Promise((resolve) => {
      speechSynthesis.speak = (utterance) => resolve(utterance.text);
    });
    [...document.querySelectorAll('.actions-bar button')].find((b) => b.textContent.trim() === 'Read aloud').click();
    return heard;
  });

  const plates = [
    {
      file: 'screenshot-1-editing.png',
      title: 'Write maths beside your work',
      body: 'Type LaTeX or pick symbols in Chrome’s side panel, then copy the equation as MathML or LaTeX.',
      specimen: specimenSheet(),
      panel: editing,
    },
    {
      file: 'screenshot-2-search.png',
      title: 'Find a symbol by its meaning',
      body: 'Search over 700 symbols by description, or browse them by category.',
      specimen: specimenEntry(),
      panel: searching,
    },
    {
      file: 'screenshot-3-drawing.png',
      title: 'Draw the symbol you cannot name',
      body: 'Sketch it with a mouse, pen or finger and pick from the matches.',
      specimen: specimenDrawn(),
      panel: drawing,
    },
    {
      file: 'screenshot-4-library.png',
      title: 'Keep the formulae you reuse',
      body: 'Save an equation with a name and insert it again in one step.',
      specimen: specimenContents(),
      panel: library,
    },
    {
      file: 'screenshot-5-contrast.png',
      title: 'Built for keyboard and screen reader',
      body: 'Every control works from the keyboard. Equations are read aloud in ClearSpeak or MathSpeak.',
      specimen: specimenSpoken(spoken),
      panel: contrast,
      theme: CONTRAST,
    },
  ];

  const frame = await context.newPage();
  await frame.setViewportSize({ width: 1280, height: 800 });
  for (const [index, plate] of plates.entries()) {
    await frame.setContent(plateHtml({ ...plate, number: index + 1 }));
    await frame.evaluate(() => document.fonts.ready);
    await frame.waitForTimeout(300);
    await frame.screenshot({ path: path.join(OUT, plate.file) });
    console.log(plate.file);
  }

  for (const tile of [
    { file: 'promo-small-440x280.png', width: 440, height: 280 },
    { file: 'promo-marquee-1400x560.png', width: 1400, height: 560, panel: editing },
  ]) {
    await frame.setViewportSize({ width: tile.width, height: tile.height });
    await frame.setContent(promoHtml(tile));
    await frame.evaluate(() => document.fonts.ready);
    await frame.waitForTimeout(300);
    await frame.screenshot({ path: path.join(OUT, tile.file) });
    console.log(tile.file);
  }
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}

/**
 * The radical sign as an SVG the size of the image: a short hook, a heavy
 * down-stroke to `foot`, a fine stroke rising to the bar at `top`, and the
 * bar running to `right`, where it turns down as a printed vinculum does.
 */
function radicalSvg({ width, height, foot, top, right, colour, scale = 1 }) {
  const [fx, fy] = foot;
  const fine = 6 * scale;
  const heavy = 12 * scale;
  const hookStart = [fx - 62 * scale, fy - 104 * scale];
  const hookTurn = [fx - 40 * scale, fy - 118 * scale];
  // The rising stroke leans as the panel's own sign does: 14 across for
  // every 100 up.
  const rise = [fx + (fy - top) * 0.14, top];
  return `<svg class="radical" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <g fill="none" stroke="${colour}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M${hookStart} L${hookTurn}" stroke-width="${fine}"/>
      <path d="M${hookTurn} L${fx},${fy}" stroke-width="${heavy}"/>
      <path d="M${fx},${fy} L${rise} L${right},${top} L${right},${top + 26 * scale}" stroke-width="${fine}"/>
    </g>
  </svg>`;
}

function plateHtml({ title, body, specimen, panel, number, theme = INK }) {
  const t = theme;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    body { width: 1280px; height: 800px; background: ${t.ground}; color: ${t.text};
      background-image: linear-gradient(${t.grid} 1px, transparent 1px), linear-gradient(90deg, ${t.grid} 1px, transparent 1px);
      background-size: 40px 40px; background-position: 19px 3px; }
    .index { position: absolute; left: 70px; top: 388px; font-size: 54px; line-height: 1; color: ${t.line}; }
    .copy { position: absolute; left: 236px; top: 136px; width: 520px; }
    h1 { font-family: 'STIX Two Math', serif; font-weight: 400; font-size: 66px; line-height: 1.06; letter-spacing: -0.012em; }
    .body { margin-top: 22px; font-size: 21px; line-height: 1.5; color: ${t.muted}; max-width: 22em; }
    .specimen { position: absolute; left: 236px; bottom: 56px; width: 520px; height: 250px; display: flex; align-items: flex-end; color: ${t.text}; }
    .panel { position: absolute; left: 816px; top: 124px; width: ${PANEL.width}px; height: ${PANEL.height}px; border-radius: 16px;
      overflow: hidden; box-shadow: 0 30px 70px rgb(0 0 0 / 0.5), 0 0 0 1px ${t.faint}; }
    .panel img { display: block; width: 100%; height: 100%; }
    .rule { border: 0; border-top: 1px solid ${t.faint}; }
    .sheet { background: ${t.sheet}; color: ${t.sheetText}; }
    .line { color: ${t.line}; }
    .muted { color: ${t.muted}; }
    .faint-edge { border: 1.5px solid ${t.faint}; }
  </style></head><body>
    ${radicalSvg({ width: 1280, height: 800, foot: [140, 600], top: 76, right: 1216, colour: t.line })}
    <p class="index serif" aria-hidden="true">${number}</p>
    <div class="copy"><h1>${title}</h1><p class="body">${body}</p></div>
    <div class="specimen">${specimen}</div>
    <div class="panel"><img alt="" src="data:image/png;base64,${panel}"></div>
  </body></html>`;
}

/** Plate 1: the equation where it ends up, on a page of someone's notes. */
function specimenSheet() {
  return `<div class="sheet serif" style="width: 440px; padding: 26px 32px 30px; border-radius: 4px; box-shadow: 0 18px 40px rgb(0 0 0 / 0.35); transform: rotate(-1.6deg); transform-origin: left bottom;">
    <p style="font-size: 21px; line-height: 1.4;">The roots of <math><mi>a</mi><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mi>b</mi><mi>x</mi><mo>+</mo><mi>c</mi><mo>=</mo><mn>0</mn></math> are</p>
    <div style="font-size: 34px; margin-top: 16px;">${QUADRATIC_MATHML}</div>
  </div>`;
}

/** Plate 2: the symbol set as a dictionary sets a headword. */
function specimenEntry() {
  return `<div style="display: flex; align-items: flex-end; gap: 36px; width: 100%;">
    <span class="serif line" style="font-size: 210px; line-height: 0.82;">∠</span>
    <div style="padding-bottom: 6px; flex: 1;">
      <p class="serif" style="font-size: 44px; line-height: 1;">angle</p>
      <p class="mono muted" style="font-size: 19px; margin-top: 12px;">\\angle</p>
      <hr class="rule" style="margin: 18px 0 14px;">
      <p class="serif muted" style="font-size: 22px; line-height: 1.5;">∡ measured angle<br>∢ spherical angle</p>
    </div>
  </div>`;
}

/** Plate 3: three pen strokes beside the symbol they are read as. */
function specimenDrawn() {
  return `<div style="display: flex; align-items: flex-end; gap: 30px;">
    <svg width="190" height="200" viewBox="0 0 190 200" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 26 C34 62, 62 128, 92 180"/>
        <path d="M168 20 C150 70, 122 126, 96 184"/>
        <path d="M50 96 C78 90, 112 92, 142 88"/>
      </g>
    </svg>
    <span class="serif muted" style="font-size: 54px; line-height: 1; padding-bottom: 66px;">→</span>
    <div style="text-align: center;">
      <span class="serif line" style="display: block; font-size: 210px; line-height: 0.86;">∀</span>
      <p class="mono muted" style="font-size: 19px; margin-top: 14px;">\\forall</p>
    </div>
  </div>`;
}

/** Plate 4: saved formulae set as a book sets its contents. */
function specimenContents() {
  const rows = [
    ['Quadratic formula', `<math><mfrac><mrow><mo>−</mo><mi>b</mi><mo>±</mo><msqrt><msup><mi>b</mi><mn>2</mn></msup><mo>−</mo><mn>4</mn><mi>a</mi><mi>c</mi></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></math>`],
    ['Euler’s identity', `<math><msup><mi>e</mi><mrow><mi>i</mi><mi>π</mi></mrow></msup><mo>+</mo><mn>1</mn><mo>=</mo><mn>0</mn></math>`],
    ['Pythagoras’ theorem', `<math><msup><mi>a</mi><mn>2</mn></msup><mo>+</mo><msup><mi>b</mi><mn>2</mn></msup><mo>=</mo><msup><mi>c</mi><mn>2</mn></msup></math>`],
  ];
  return `<div class="serif" style="width: 100%; display: grid; gap: 18px;">${rows
    .map(
      ([name, maths]) => `<div style="display: flex; align-items: baseline; gap: 12px; font-size: 27px;">
        <span>${name}</span>
        <span class="muted" style="flex: 1; border-bottom: 2px dotted; opacity: 0.45; transform: translateY(-5px);"></span>
        <span class="line">${maths}</span>
      </div>`,
    )
    .join('')}</div>`;
}

/** Plate 5: the keys that do the work, and the words the equation is read as. */
function specimenSpoken(spoken) {
  const key = (label) =>
    `<span class="faint-edge" style="display: inline-block; min-width: 46px; padding: 8px 12px; border-radius: 8px; border-bottom-width: 4px; font-size: 19px; font-weight: 600; text-align: center;">${label}</span>`;
  const row = (keys, label) =>
    `<div style="display: flex; align-items: center; gap: 8px;">${keys.map(key).join('')}<span style="margin-left: 10px; font-size: 20px;">${label}</span></div>`;
  return `<div style="width: 100%;">
    <p class="serif" style="font-size: 25px; line-height: 1.36;">“${spoken}”</p>
    <hr class="rule" style="margin: 20px 0;">
    <div style="display: flex; gap: 34px;">${row(['Alt', 'C'], 'Copy')}${row(['Ctrl', '/'], 'Find a symbol')}</div>
  </div>`;
}

/**
 * The promo tiles: the name is the radicand. The marquee adds the line and
 * the panel; the small tile is the sign and the name alone.
 */
function promoHtml({ width, height, panel }) {
  const t = INK;
  const small = !panel;
  const sign = small
    ? { foot: [84, 196], top: 78, right: 404, scale: 0.62, name: 62, left: 116, nameTop: 104 }
    : { foot: [150, 408], top: 96, right: 1330, scale: 1, name: 132, left: 232, nameTop: 150 };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    body { width: ${width}px; height: ${height}px; background: ${t.ground}; color: ${t.text};
      background-image: linear-gradient(${t.grid} 1px, transparent 1px), linear-gradient(90deg, ${t.grid} 1px, transparent 1px);
      background-size: 40px 40px; background-position: 9px 15px; }
    .name { position: absolute; left: ${sign.left}px; top: ${sign.nameTop}px; font-family: 'STIX Two Math', serif;
      font-size: ${sign.name}px; line-height: 1; letter-spacing: -0.01em; }
    .tag { position: absolute; left: ${sign.left + 4}px; top: ${sign.nameTop + sign.name + (small ? 12 : 30)}px;
      font-size: ${small ? 17 : 30}px; color: ${t.muted}; }
    .panel { position: absolute; left: 920px; top: 150px; width: ${PANEL.width}px; border-radius: 16px 16px 0 0; overflow: hidden;
      box-shadow: 0 30px 70px rgb(0 0 0 / 0.5), 0 0 0 1px ${t.faint}; }
    .panel img { display: block; width: 100%; }
  </style></head><body>
    ${radicalSvg({ width, height, foot: sign.foot, top: sign.top, right: sign.right, colour: t.line, scale: sign.scale })}
    <p class="name">Radicand</p>
    <p class="tag">Maths, beside your work</p>
    ${panel ? `<div class="panel"><img alt="" src="data:image/png;base64,${panel}"></div>` : ''}
  </body></html>`;
}
