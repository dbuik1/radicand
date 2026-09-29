/**
 * Generate the Chrome Web Store images: five 1280×800 screenshots, the
 * 440×280 small promo tile and the 1400×560 marquee, into docs/store/. The panel shots come from the
 * built extension in `dist/` loaded into Chromium, so run `npm run build`
 * first. The first two screenshots show the panel beside texnique.xyz, a
 * LaTeX typesetting game, fetched live – so this script needs a network
 * connection and `curl`. Run: node scripts/generate-store-images.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchExtensionContext } from '../tests/launch-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs', 'store');
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
const icon = readFileSync(path.join(ROOT, 'src', 'assets', 'icons', 'icon-128.png')).toString('base64');

// The panel is shown at the width Chrome gives a side panel by default.
const PANEL = { width: 400, height: 720 };
const QUADRATIC = 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}';
// The browser-window shots: a Chrome window with the page on the left and
// the side panel, under its own header, on the right.
const WINDOW = { width: 1200, height: 668, toolbar: 44, panelHeader: 36 };
const SIDE = { width: PANEL.width, height: WINDOW.height - WINDOW.toolbar - WINDOW.panelHeader };
const PAGE = { width: WINDOW.width - PANEL.width - 1, height: WINDOW.height - WINDOW.toolbar };
const TEXNIQUE = 'https://texnique.xyz/';
// The promo tile and the marquee share one design at two sizes: the name, the
// line and four tools on white, beside a blue edge carrying the real panel.
const PROMO = {
  small: { file: 'promo-small-440x280.png', width: 440, height: 280, side: 92, pad: '24px 18px 24px 26px',
    logo: 44, name: 26, line: 30, card: 66, gap: 8, label: 13, key: [22, 24, 13], speaker: 24, forAll: 22, sketch: 30,
    sidePad: '34px 0 34px 12px', panelWidth: 160, panelInset: 10 },
  marquee: { file: 'promo-marquee-1400x560.png', width: 1400, height: 560, side: 400, pad: '56px 48px 56px 72px',
    logo: 88, name: 52, line: 76, card: 140, gap: 18, label: 24, key: [44, 48, 26], speaker: 52, forAll: 48, sketch: 64,
    sidePad: '56px 0 0 48px', panelWidth: 400, panelInset: 16 },
};

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
  const openMode = async (menu, label) => {
    await panel.evaluate(
      ({ menu, label }) => {
        document.getElementById(`${menu}-trigger`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const item = [...document.querySelectorAll(`#${menu}-menu [role="menuitem"]`)].find(
          (el) => (el.querySelector('.menu__label') ?? el).textContent.trim() === label,
        );
        if (!item) throw new Error(`no "${label}" item in #${menu}-menu`);
        item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      },
      { menu, label },
    );
    await panel.waitForFunction(
      (l) => document.querySelector('.mode:not([hidden]) .mode__title')?.textContent?.trim() === l,
      label,
      { timeout: 5000 },
    );
  };
  const closeMode = async () => {
    await panel.evaluate(() => {
      const close = [...document.querySelectorAll('.mode:not([hidden]) button')].find(
        (b) => b.textContent.trim() === 'Close',
      );
      close?.click();
    });
    await panel.waitForTimeout(150);
  };
  const setCopyFormat = (label) =>
    panel.evaluate((wanted) => {
      document.getElementById('copy-format-trigger')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const item = [...document.querySelectorAll('#copy-format-menu [role="menuitemradio"]')].find(
        (el) => el.textContent.trim() === wanted,
      );
      if (!item) throw new Error(`no "${wanted}" copy format`);
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, label);
  const shoot = async ({ keepFocus = false } = {}) => {
    // Nothing focused, so no focus ring or caret lands in the picture –
    // except where the focus is what shows the feature.
    if (!keepFocus) await panel.evaluate(() => document.activeElement?.blur());
    await panel.waitForTimeout(250);
    return (await panel.screenshot()).toString('base64');
  };

  // 1. The quadratic formula built in the panel, its LaTeX pasted into a
  // TeXnique problem and accepted.
  await panel.setViewportSize(SIDE);
  await setCopyFormat('LaTeX');
  await setEquation(QUADRATIC);
  const texEditing = await shoot();

  // 2. Half-way through a problem, searching for the symbol by meaning.
  await setEquation('c^2=a^2+b^2-2ab\\cos');
  await panel.fill('.symbol-search__input', 'angle');
  await panel.waitForSelector('.symbol-search__list [role="option"]', { timeout: 5000 });
  const angle = await panel.evaluate(() =>
    [...document.querySelectorAll('.symbol-search__list [role="option"]')].findIndex((o) =>
      o.textContent.includes('\\angle'),
    ),
  );
  for (let i = 0; i < angle; i += 1) await panel.press('.symbol-search__input', 'ArrowDown');
  await panel.waitForTimeout(200);
  const texSearching = await shoot({ keepFocus: true });
  await panel.fill('.symbol-search__input', '');
  await panel.setViewportSize(PANEL);
  await setCopyFormat('MathML');

  // 3. Drawing a ∀ and its matches.
  await setEquation('');
  await openMode('from', 'Drawing');
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
  await closeMode();

  // 4. My library with the starter formulae.
  await setEquation(QUADRATIC);
  await openMode('from', 'My library');
  await panel.evaluate(() => {
    [...document.querySelectorAll('.mode:not([hidden]) button')]
      .find((b) => b.textContent.trim() === 'Add starter formulae')
      ?.click();
  });
  await panel.waitForSelector('.library-row__insert', { timeout: 5000 });
  const library = await shoot();
  await closeMode();

  // 5. The high-contrast theme.
  await setEquation('\\int_0^{\\infty}e^{-x^2}\\,dx=\\frac{\\sqrt{\\pi}}{2}');
  await panel.evaluate(() => {
    document.documentElement.dataset.theme = 'high-contrast';
  });
  const contrast = await shoot();

  // The TeXnique pages last: while a second page is open in the context the
  // panel's symbol search lists no results.
  const texSolved = await texnique('Quadratic Formula', QUADRATIC);
  const texStuck = await texnique('Law of Cosines', 'c^2 = a^2 + b^2 - 2ab \\cos');

  const shots = [
    {
      file: 'screenshot-1-editing.png',
      title: 'Build the equation, then copy its LaTeX or MathML anywhere',
      page: texSolved,
      panel: texEditing,
    },
    {
      file: 'screenshot-2-search.png',
      title: 'Stuck on a symbol? Search for it by what it means',
      page: texStuck,
      panel: texSearching,
    },
    {
      file: 'screenshot-3-drawing.png',
      title: 'Draw it if you cannot name it',
      body: 'Sketch a symbol with a mouse, pen or finger and insert it from the matches.',
      panel: drawing,
    },
    {
      file: 'screenshot-4-library.png',
      title: 'Keep the formulae you reuse',
      body: 'Save equations to your library with a name, find them again and insert them in one step.',
      panel: library,
    },
    {
      file: 'screenshot-5-contrast.png',
      title: 'Made for the keyboard and screen readers',
      body: 'Every control works from the keyboard. Equations are read aloud in ClearSpeak or MathSpeak. Light, dark and high-contrast themes.',
      panel: contrast,
      dark: true,
    },
  ];

  const frame = await context.newPage();
  await frame.setViewportSize({ width: 1280, height: 800 });
  for (const shot of shots) {
    await frame.setContent(shot.page ? browserHtml(shot) : screenshotHtml(shot));
    await frame.waitForTimeout(300);
    await frame.screenshot({ path: path.join(OUT, shot.file) });
    console.log(shot.file);
  }

  for (const tile of Object.values(PROMO)) {
    await frame.setViewportSize({ width: tile.width, height: tile.height });
    await frame.setContent(promoHtml(texEditing, tile));
    await frame.waitForTimeout(300);
    await frame.screenshot({ path: path.join(OUT, tile.file) });
    console.log(tile.file);
  }
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}

/**
 * Open a TeXnique problem by title in Zen mode, type `input` into its answer
 * box and return a screenshot of the page scrolled to the problem. Requests
 * go through `curl` so they use the system's certificate and proxy settings;
 * analytics and the leaderboard backend are never requested.
 */
async function texnique(title, input) {
  const page = await context.newPage();
  await page.setViewportSize(PAGE);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (/googletagmanager|google-analytics|firebase/.test(url)) return route.abort();
    if (request.method() !== 'GET' || !url.startsWith('https://')) return route.continue();
    const bodyFile = path.join(userDataDir, 'texnique-response');
    const [status, contentType] = execFileSync(
      'curl',
      ['-sS', '--max-time', '30', '-o', bodyFile, '-w', '%{http_code} %{content_type}', url],
      { encoding: 'utf8' },
    ).split(' ');
    await route.fulfill({
      status: Number(status),
      contentType: contentType || 'application/octet-stream',
      body: readFileSync(bodyFile),
    });
  });
  await page.goto(TEXNIQUE, { waitUntil: 'load', timeout: 60000 });
  await page.click('#start-button-untimed');
  await page.evaluate((wanted) => {
    const index = problems.findIndex((p) => p.title === wanted);
    if (index < 0) throw new Error(`no TeXnique problem called "${wanted}"`);
    problemsOrder = [index];
    problemNumber = 0;
    loadProblem();
    // Keep the answer on screen once it is accepted, instead of moving on.
    window.loadProblem = () => {};
  }, title);
  await page.fill('#user-input', input);
  await page.press('#user-input', 'End');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.getElementById('user-input').blur();
    const top = document.getElementById('problem-title').getBoundingClientRect().top;
    window.scrollBy(0, top - 24);
  });
  await page.waitForTimeout(300);
  const png = (await page.screenshot()).toString('base64');
  await page.close();
  return png;
}

function browserHtml({ title, page, panel }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 800px; background: #0b5cad; color: #fff; overflow: hidden;
      font-family: 'Liberation Sans', Arial, sans-serif; padding: 0 40px; display: grid;
      grid-template-rows: 1fr ${WINDOW.height}px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    h1 { font-size: 34px; line-height: 1.15; letter-spacing: -0.01em; }
    .brand { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; color: #dcebfb; flex: none; }
    .brand img { width: 36px; height: 36px; }
    .window { width: ${WINDOW.width}px; border-radius: 10px 10px 0 0; overflow: hidden; background: #fff;
      display: grid; grid-template-rows: ${WINDOW.toolbar}px 1fr; box-shadow: 0 -8px 40px rgb(0 0 0 / 0.25); }
    .toolbar { background: #dee3ea; display: flex; align-items: center; gap: 8px; padding: 0 14px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .address { margin-left: 18px; flex: 1; max-width: 560px; background: #fff; border-radius: 99px; padding: 6px 16px;
      font-size: 14px; color: #3d4f66; }
    .content { display: grid; grid-template-columns: ${PAGE.width}px 1px ${PANEL.width}px; }
    .content > img { display: block; }
    .rule { background: #c4ccd6; }
    .side { display: grid; grid-template-rows: ${WINDOW.panelHeader}px 1fr; }
    .side__header { display: flex; align-items: center; gap: 8px; padding: 0 12px; background: #f3f5f8;
      border-bottom: 1px solid #dee3ea; color: #1f2a37; font-size: 13px; font-weight: 700; }
    .side__header img { width: 16px; height: 16px; }
  </style></head><body>
    <header><h1>${title}</h1><p class="brand"><img alt="" src="data:image/png;base64,${icon}">Radicand</p></header>
    <div class="window">
      <div class="toolbar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
        <span class="address">texnique.xyz</span></div>
      <div class="content"><img alt="" src="data:image/png;base64,${page}"><span class="rule"></span>
        <div class="side"><div class="side__header"><img alt="" src="data:image/png;base64,${icon}">Radicand</div>
          <img alt="" src="data:image/png;base64,${panel}"></div></div>
    </div>
  </body></html>`;
}

function screenshotHtml({ title, body, panel, dark }) {
  const ground = dark ? '#0d1117' : '#eef3f9';
  const ink = dark ? '#ffffff' : '#0f1f33';
  const muted = dark ? '#c9d4e0' : '#3d4f66';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 800px; background: ${ground}; color: ${ink};
      font-family: 'Liberation Sans', Arial, sans-serif; display: grid;
      grid-template-columns: 1fr ${PANEL.width}px; gap: 72px; padding: 40px 96px 40px 96px; align-items: center; }
    .copy { display: grid; gap: 22px; align-content: center; }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 700; color: ${muted}; }
    .brand img { width: 40px; height: 40px; }
    h1 { font-size: 46px; line-height: 1.12; letter-spacing: -0.01em; max-width: 14em; }
    .body { font-size: 22px; line-height: 1.5; color: ${muted}; max-width: 30em; }
    .panel { width: ${PANEL.width}px; height: ${PANEL.height}px; border-radius: 10px; overflow: hidden;
      box-shadow: 0 18px 50px rgb(15 31 51 / 0.22), 0 0 0 1px rgb(15 31 51 / 0.12); }
    .panel img { display: block; width: 100%; height: 100%; }
  </style></head><body>
    <div class="copy">
      <p class="brand"><img alt="" src="data:image/png;base64,${icon}">Radicand</p>
      <h1>${title}</h1>
      <p class="body">${body}</p>
    </div>
    <div class="panel"><img alt="" src="data:image/png;base64,${panel}"></div>
  </body></html>`;
}

function promoHtml(panel, t) {
  const blue = '#0b5cad';
  const sketch = `<svg width="${t.sketch}" height="${t.sketch}" viewBox="0 0 56 56" aria-hidden="true" style="background:#fff;border:1.5px dashed #b8c4d2;border-radius:8px"><path d="M36 10 Q30 5 27 14 L24 42 Q22 51 15 47" fill="none" stroke="${blue}" stroke-width="3.5" stroke-linecap="round"/></svg>`;
  const speaker = `<svg width="${t.speaker}" height="${t.speaker}" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="${blue}"/><path d="M11 5q2 3 0 6M13 3q3.5 5 0 10" stroke="${blue}" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const [kw, kh, ks] = t.key;
  const key = `<span style="display:inline-grid;place-items:center;width:${kw}px;height:${kh}px;border-radius:6px;background:#fff;color:#13233a;box-shadow:0 3px 0 #7db8ff;font-family:'Liberation Mono',monospace;font-size:${ks}px">\\</span>`;
  const tools = [
    ['Type', key],
    ['Hear', speaker],
    ['Find', `<span style="font-size:${t.forAll}px;line-height:1;color:${blue}">∀</span>`],
    ['Sketch', sketch],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: ${t.width}px; height: ${t.height}px; background: #fff; color: #0f1f33; overflow: hidden;
      font-family: 'Liberation Sans', Arial, sans-serif; display: grid; grid-template-columns: 1fr ${t.side}px; }
    .main { padding: ${t.pad}; display: grid; align-content: space-between; box-shadow: inset 1px 1px 0 #d5dde8, inset 0 -1px 0 #d5dde8; }
    .name { display: flex; align-items: center; gap: ${Math.round(t.logo * 0.27)}px; font-size: ${t.name}px; font-weight: 700; line-height: 1; }
    .name img { width: ${t.logo}px; height: ${t.logo}px; }
    .line { font-size: ${t.line}px; font-weight: 700; line-height: 1.05; letter-spacing: -0.01em; color: ${blue}; }
    .tools { display: grid; grid-template-columns: repeat(4, 1fr); gap: ${t.gap}px; }
    .tool { background: #eef3f9; border-radius: ${Math.round(t.card * 0.14)}px; height: ${t.card}px; display: grid;
      grid-template-rows: 1fr auto; justify-items: center; align-items: center; padding: ${Math.round(t.card * 0.09)}px 0;
      font-size: ${t.label}px; font-weight: 700; }
    .side { background: ${blue}; padding: ${t.sidePad}; overflow: hidden; }
    .sheet { background: #fff; border-radius: 10px 0 0 10px; padding: ${t.panelInset}px 0 ${t.panelInset}px ${t.panelInset}px;
      height: 100%; overflow: hidden; }
    .sheet img { display: block; width: ${t.panelWidth}px; }
  </style></head><body>
    <div class="main">
      <p class="name"><img alt="" src="data:image/png;base64,${icon}">Radicand</p>
      <p class="line">Maths, beside<br>your work.</p>
      <div class="tools">${tools.map(([label, picture]) => `<div class="tool">${picture}<span>${label}</span></div>`).join('')}</div>
    </div>
    <div class="side"><div class="sheet"><img alt="" src="data:image/png;base64,${panel}"></div></div>
  </body></html>`;
}
