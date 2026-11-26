/**
 * Generate the Chrome Web Store images: five 1280×800 screenshots, the
 * 440×280 small promo tile and the 1400×560 marquee, into docs/store/.
 *
 * Every image is one plate in a series. A large radical sign runs up the
 * left edge and its bar across the top, so the content is the radicand; the
 * number in the crook of the sign (where a root's index goes) is the plate
 * number. Text is in Inter, the panel's own face; maths is in the bundled
 * STIX Two Math.
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

// One series, five grounds. Each plate keeps the sign, the type and the
// layout and changes its colours, its paper and the theme of its panel.
const INK = { ground: '#0a1424', shade: '#152847', line: '#5aabff', text: '#f4f7fc', muted: '#c3cde0',
  faint: 'rgb(244 247 252 / 0.16)', card: '#0a1424', paper: 'grid', mark: 'rgb(90 171 255 / 0.06)', panel: 'light' };
const PAPER = { ground: '#dfe6f2', shade: '#f6f8fc', line: '#1f6fdc', text: '#14233c', muted: '#414e66',
  faint: 'rgb(20 35 60 / 0.2)', card: '#ffffff', paper: 'ruled', mark: 'rgb(31 111 220 / 0.13)', panel: 'dark' };
const SKY = { ground: '#5aabff', shade: '#ffffff', line: '#14233c', accent: '#1f6fdc', text: '#14233c', muted: '#414e66',
  faint: 'rgb(20 35 60 / 0.25)', card: '#eef2f9', paper: 'dots', mark: 'rgb(20 35 60 / 0.1)', panel: 'light' };
const GRAPH = { ground: '#f3f5f9', shade: '#ffffff', line: '#1f6fdc', accent: '#1f6fdc', text: '#14233c', muted: '#414e66',
  faint: 'rgb(20 35 60 / 0.25)', card: '#eef2f9', paper: 'grid', mark: 'rgb(31 111 220 / 0.14)', panel: 'dark' };
const CONTRAST = { ground: '#000000', shade: '#141414', line: '#ffd60a', text: '#ffffff', muted: '#ffffff',
  faint: 'rgb(255 255 255 / 0.45)', card: '#000000', paper: 'grid', mark: 'rgb(255 214 10 / 0.07)', panel: 'high-contrast' };
const SHEET = { ground: '#ffffff', text: '#14233c' };

const BASE_CSS = `
  ${FONTS}
  * { box-sizing: border-box; margin: 0; }
  body { overflow: hidden; position: relative; font-family: 'Inter', sans-serif; }
  .radical { position: absolute; inset: 0; }
  .serif, math { font-family: 'STIX Two Math', serif; }
  .mono { font-family: ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace; }
`;

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
  const setTheme = (theme) =>
    panel.evaluate((name) => {
      document.documentElement.dataset.theme = name;
    }, theme.panel);
  const shoot = async ({ keepFocus = false, theme = INK } = {}) => {
    await setTheme(theme);
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
  const searching = await shoot({ keepFocus: true, theme: PAPER });
  await panel.fill('.symbol-search__input', '');

  // 3. A drawn ∀ and its matches.
  await setEquation('');
  // The ink takes the theme's colour as it is drawn.
  await setTheme(SKY);
  await openTab('drawing');
  const box = await panel.evaluate(() => {
    const r = document.querySelector('.draw-find__surface').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const at = (fx, fy) => [box.x + 8 + fx * (box.width - 16), box.y + 8 + fy * (box.height - 16)];
  // Drawn as a hand draws: strokes that bow, start and end unevenly, and a
  // bar that slopes and overshoots.
  for (const stroke of [
    [[0.29, 0.15], [0.35, 0.37], [0.43, 0.61], [0.5, 0.87]],
    [[0.72, 0.11], [0.66, 0.35], [0.57, 0.63], [0.5, 0.89]],
    [[0.35, 0.51], [0.5, 0.47], [0.66, 0.49]],
  ]) {
    await panel.mouse.move(...at(...stroke[0]));
    await panel.mouse.down();
    for (const point of stroke.slice(1)) await panel.mouse.move(...at(...point), { steps: 5 });
    await panel.mouse.up();
    await panel.waitForTimeout(150);
  }
  await panel.waitForSelector('.draw-find__option', { timeout: 10000 });
  const drawing = await shoot({ theme: SKY });
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
  const library = await shoot({ theme: GRAPH });
  // The maths on the notes page is the field's own rendering, taken at
  // twice the size so it stays sharp when the page shows it larger.
  await panel.setViewportSize({ width: PANEL.width * 2, height: PANEL.height * 2 });
  await panel.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  // Only the maths itself is taken, so the page can show all of it.
  const mathsBox = await panel.evaluate(() => {
    const base = document.querySelector('math-field').shadowRoot.querySelector('.ML__base');
    const r = base.getBoundingClientRect();
    return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 };
  });
  const fieldMaths = (await panel.screenshot({ clip: mathsBox })).toString('base64');
  await panel.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  await panel.setViewportSize(PANEL);
  await openTab('symbols');

  // 5. The high-contrast theme, and the words Read aloud says for its
  // equation: the synthesiser is replaced so the text can be read back.
  await setEquation(GAUSSIAN);
  const contrast = await shoot({ theme: CONTRAST });
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
      title: 'Write maths <em>beside</em> your work',
      body: 'Type LaTeX or pick symbols, then copy the equation as MathML or LaTeX.',
      specimen: specimenSheet(fieldMaths),
      panel: editing,
    },
    {
      file: 'screenshot-2-search.png',
      title: 'Find a symbol by its <em>meaning</em>',
      body: 'Search over 700 symbols by description, or browse them by category.',
      specimen: specimenEntry(PAPER),
      panel: searching,
      theme: PAPER,
    },
    {
      file: 'screenshot-3-drawing.png',
      title: '<em>Draw</em> the symbol you cannot name',
      body: 'Sketch it with a mouse, pen or finger and pick from the matches.',
      specimen: specimenDrawn(),
      panel: drawing,
      theme: SKY,
    },
    {
      file: 'screenshot-4-library.png',
      title: 'Save formulae<br>you use <em>again<br>and again</em>',
      body: '',
      specimen: specimenContents(),
      panel: library,
      theme: GRAPH,
    },
    {
      file: 'screenshot-5-contrast.png',
      title: 'Built for <em>keyboard</em> and screen reader',
      body: 'Works fully from the keyboard, and reads aloud in the ClearSpeak or MathSpeak speech style.',
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

/** The paper each plate is printed on: squared, ruled, dotted or plain. */
function paperCss(t) {
  if (t.paper === 'grid') {
    return `background-image: linear-gradient(${t.mark} 1px, transparent 1px), linear-gradient(90deg, ${t.mark} 1px, transparent 1px);
      background-size: 40px 40px; background-position: 15px 23px;`;
  }
  if (t.paper === 'ruled') {
    return `background-image: linear-gradient(${t.mark} 2px, transparent 2px); background-size: 100% 36px; background-position: 0 20px;`;
  }
  if (t.paper === 'dots') {
    return `background-image: radial-gradient(circle, ${t.mark} 2px, transparent 2.5px); background-size: 28px 28px; background-position: 9px 11px;`;
  }
  return '';
}

/**
 * The radical sign as an SVG the size of the image: a short hook, a stroke
 * down to `foot`, a stroke rising to the bar at `top`, and the bar
 * running to `right`, where it turns down as a printed vinculum does. The
 * space under the bar is a shade lighter than the ground, so the sign reads
 * as the thing that holds the content, and the bar carries the ticks of a
 * ruler on its underside.
 */
function radicalSvg({ width, height, foot, top, right, theme, scale = 1 }) {
  const [fx, fy] = foot;
  // One even stroke with round joins, in the proportions of the panel's own
  // sign: a short hook, then down to the foot.
  const weight = 11 * scale;
  const lean = 0.14;
  const hookStart = [fx - 62 * scale, fy - 118 * scale];
  const hookTurn = [fx - 40 * scale, fy - 130 * scale];
  const rise = [fx + (fy - top) * lean, top];
  // The rising stroke's line carried on to the bottom edge closes the shade.
  const base = [fx - (height - fy) * lean, height];
  const ticks = [];
  for (let x = right - 40, n = 1; x > rise[0] + 30; x -= 40, n += 1) {
    ticks.push(`M${x},${top + weight / 2} v${(n % 5 === 0 ? 20 : 10) * scale}`);
  }
  return `<svg class="radical" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <polygon points="${rise} ${right},${top} ${right},${height} ${base}" fill="${theme.shade}"/>
    <path d="${ticks.join(' ')}" stroke="${theme.line}" stroke-width="${2 * scale}" opacity="0.45"/>
    <path d="M${hookStart} L${hookTurn} L${fx},${fy} L${rise} L${right},${top} L${right},${top + 34 * scale}"
      fill="none" stroke="${theme.line}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function plateHtml({ title, body, specimen, panel, number, theme = INK }) {
  const t = theme;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    body { width: 1280px; height: 800px; background: ${t.ground}; color: ${t.text}; }
    .grid { position: absolute; inset: 0; ${paperCss(t)} }
    .index { position: absolute; left: 52px; top: 362px; font-size: 76px; font-weight: 800; line-height: 1; color: ${t.line}; letter-spacing: -0.03em; }
    .copy { position: absolute; left: 244px; top: 122px; width: 560px; }
    h1 { font-weight: 800; font-size: 64px; line-height: 1.02; letter-spacing: -0.035em; }
    h1 em { font-style: normal; color: ${t.accent ?? t.line}; }
    .body { margin-top: 22px; font-size: 22px; line-height: 1.45; color: ${t.muted}; max-width: 23em; }
    .specimen { position: absolute; left: 244px; top: 340px; bottom: 44px; width: 548px; display: flex; align-items: center; color: ${t.text}; }
    .panel { position: absolute; left: 836px; top: 132px; width: ${PANEL.width}px; height: ${PANEL.height}px; border-radius: 16px;
      overflow: hidden; box-shadow: 0 34px 80px rgb(0 0 0 / 0.55), 0 0 0 1px ${t.faint}; }
    .panel img { display: block; width: 100%; height: 100%; }
    .rule { border: 0; border-top: 2px solid ${t.faint}; }
    .sheet { background: ${SHEET.ground}; color: ${SHEET.text}; }
    .card { background: ${t.card}; border: 1.5px solid ${t.faint}; }
    .line { color: ${t.accent ?? t.line}; }
    .muted { color: ${t.muted}; }
    .faint-edge { border: 2px solid ${t.faint}; }
  </style></head><body>
    ${radicalSvg({ width: 1280, height: 800, foot: [150, 610], top: 70, right: 1236, theme: t })}
    <div class="grid"></div>
    <p class="index" aria-hidden="true">${number}</p>
    <div class="copy"><h1>${title}</h1><p class="body">${body}</p></div>
    <div class="specimen">${specimen}</div>
    <div class="panel"><img alt="" src="data:image/png;base64,${panel}"></div>
  </body></html>`;
}

/** Plate 1: the same equation as its LaTeX and as it lands on a page of notes. */
function specimenSheet(fieldMaths) {
  return `<div style="position: relative; width: 100%; height: 350px;">
    <div class="card mono" style="position: absolute; left: 0; top: 0; width: 500px; padding: 22px 26px 80px; border-radius: 12px; font-size: 22px;">
      <span class="muted">x=</span><span class="line">\\frac</span>{-b<span class="line">\\pm\\sqrt</span>{b^2-4ac}}{2a}
    </div>
    <div class="sheet" style="position: absolute; left: 44px; bottom: 0; width: 504px; padding: 28px 36px 34px; border-radius: 6px; box-shadow: 0 22px 50px rgb(0 0 0 / 0.45); transform: rotate(-2deg);">
      <p class="serif" style="font-size: 24px; line-height: 1.4;">The roots of <math><mi>a</mi><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mi>b</mi><mi>x</mi><mo>+</mo><mi>c</mi><mo>=</mo><mn>0</mn></math> are</p>
      <div style="height: 132px; margin-top: 8px; background: url(data:image/png;base64,${fieldMaths}) center / contain no-repeat;"></div>
    </div>
  </div>`;
}

/** Plate 2: the symbol set as a dictionary sets a headword. */
function specimenEntry(t) {
  const also = [['∡', 'measured angle'], ['∢', 'spherical angle'], ['⟨', 'left angle bracket']];
  return `<div style="display: flex; align-items: flex-end; gap: 40px; width: 100%;">
    <span class="serif line" style="font-size: 330px; line-height: 0.8;">∠</span>
    <div style="flex: 1; padding-bottom: 4px;">
      <p style="font-size: 52px; font-weight: 800; letter-spacing: -0.03em; line-height: 1;">angle</p>
      <p class="mono line" style="font-size: 22px; margin-top: 12px;">\\angle</p>
      <hr class="rule" style="margin: 20px 0 16px;">
      ${also.map(([glyph, name]) => `<p style="display: flex; gap: 14px; font-size: 22px; line-height: 1.6;" class="muted"><span class="serif" style="width: 24px; color: ${t.text};">${glyph}</span>${name}</p>`).join('')}
    </div>
  </div>`;
}

/** Plate 3: three pen strokes beside the symbol they are read as. */
function specimenDrawn() {
  return `<div style="display: flex; align-items: flex-end; gap: 28px; width: 100%;">
    <div class="card" style="width: 236px; height: 250px; border-radius: 14px; border-style: dashed; display: grid; place-items: center;">
      <svg width="190" height="200" viewBox="0 0 190 200" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M30 36 C33 58, 50 88, 58 116 S 84 158, 99 174"/>
          <path d="M152 16 C150 46, 132 72, 127 100 S 104 152, 92 188"/>
          <path d="M38 106 C60 95, 86 106, 106 96 S 140 84, 162 92"/>
        </g>
      </svg>
    </div>
    <span class="line" style="font-size: 60px; font-weight: 800; line-height: 1; padding-bottom: 92px;">→</span>
    <div style="text-align: center; flex: 1;">
      <span class="serif line" style="display: block; font-size: 300px; line-height: 0.8;">∀</span>
      <p class="mono muted" style="font-size: 22px; margin-top: 16px;">\\forall</p>
    </div>
  </div>`;
}

/** Plate 4: saved formulae set as a book sets its contents. */
function specimenContents() {
  const rows = [
    ['Euler’s identity', `<math><msup><mi>e</mi><mrow><mi>i</mi><mi>π</mi></mrow></msup><mo>+</mo><mn>1</mn><mo>=</mo><mn>0</mn></math>`],
    ['Pythagoras’ theorem', `<math><msup><mi>a</mi><mn>2</mn></msup><mo>+</mo><msup><mi>b</mi><mn>2</mn></msup><mo>=</mo><msup><mi>c</mi><mn>2</mn></msup></math>`],
    ['Area of a circle', `<math><mi>A</mi><mo>=</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></math>`],
    ['Difference of squares', `<math><msup><mi>a</mi><mn>2</mn></msup><mo>−</mo><msup><mi>b</mi><mn>2</mn></msup><mo>=</mo><mo>(</mo><mi>a</mi><mo>+</mo><mi>b</mi><mo>)</mo><mo>(</mo><mi>a</mi><mo>−</mo><mi>b</mi><mo>)</mo></math>`],
    ['Sum of a series', `<math><munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><mi>k</mi><mo>=</mo><mfrac><mrow><mi>n</mi><mo>(</mo><mi>n</mi><mo>+</mo><mn>1</mn><mo>)</mo></mrow><mn>2</mn></mfrac></math>`],
  ];
  return `<div style="width: 100%; display: grid; gap: 20px;">${rows
    .map(
      ([name, maths]) => `<div style="display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 600; min-height: 56px;">
        <span>${name}</span>
        <span class="muted" style="flex: 1; border-bottom: 3px dotted; opacity: 0.4;"></span>
        <span class="line" style="font-size: 28px; font-weight: 400;">${maths}</span>
      </div>`,
    )
    .join('')}</div>`;
}

/** Plate 5: the keys that do the work, and the words the equation is read as. */
function specimenSpoken(spoken) {
  const key = (label) =>
    `<span class="faint-edge" style="display: inline-block; min-width: 54px; padding: 10px 14px; border-radius: 10px; border-bottom-width: 5px; font-size: 21px; font-weight: 700; text-align: center;">${label}</span>`;
  const row = (keys, label) =>
    `<div style="display: flex; align-items: center; gap: 8px;">${keys.map(key).join('')}<span style="margin-left: 10px; font-size: 21px; font-weight: 600;">${label}</span></div>`;
  return `<div style="width: 100%;">
    <p style="font-size: 28px; font-weight: 600; line-height: 1.36; padding-left: 22px; border-left: 6px solid ${CONTRAST.line};">“${spoken}”</p>
    <div style="display: flex; gap: 26px; margin-top: 32px; white-space: nowrap;">${row(['Alt', 'C'], 'Quick copy')}${row(['Ctrl', '/'], 'Find symbol')}</div>
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
    ? { foot: [70, 214], top: 60, right: 416, scale: 0.6, name: 68, left: 112, nameTop: 98 }
    : { foot: [130, 446], top: 76, right: 1352, scale: 1, name: 150, left: 212, nameTop: 150 };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${BASE_CSS}
    body { width: ${width}px; height: ${height}px; background: ${t.ground}; color: ${t.text}; }
    .grid { position: absolute; inset: 0; ${paperCss(t)} }
    .name { position: absolute; left: ${sign.left}px; top: ${sign.nameTop}px; font-weight: 800;
      font-size: ${sign.name}px; line-height: 1; letter-spacing: -0.04em; }
    .tag { position: absolute; left: ${sign.left + 4}px; top: ${sign.nameTop + sign.name + (small ? 12 : 28)}px;
      font-size: ${small ? 18 : 34}px; font-weight: 500; color: ${t.muted}; }
    .panel { position: absolute; left: 936px; top: 138px; width: ${PANEL.width}px; border-radius: 16px 16px 0 0; overflow: hidden;
      box-shadow: 0 30px 70px rgb(0 0 0 / 0.5), 0 0 0 1px ${t.faint}; }
    .panel img { display: block; width: 100%; }
  </style></head><body>
    ${radicalSvg({ width, height, foot: sign.foot, top: sign.top, right: sign.right, theme: t, scale: sign.scale })}
    <div class="grid"></div>
    <p class="name">Radicand</p>
    <p class="tag">Maths, beside your work</p>
    ${panel ? `<div class="panel"><img alt="" src="data:image/png;base64,${panel}"></div>` : ''}
  </body></html>`;
}
