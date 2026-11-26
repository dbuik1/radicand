/**
 * Generate the extension icons (PNG, sizes 16/32/48/128) from an inline SVG,
 * rasterised with the Playwright-managed Chromium already used by the e2e
 * suite. Output: src/assets/icons/icon-<size>.png. Run: node scripts/generate-icons.mjs
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../tests/launch-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

// The letter is set in the panel's own typeface, read from the bundled file
// so the icons come out the same on any machine.
const inter = readFileSync(path.join(ROOT, 'src', 'assets', 'fonts', 'Inter-latin.woff2')).toString('base64');

// A white radical sign on a brand-blue tile. Its bar wraps the top left
// corner of a white field, as the sign wraps the equation field in the
// panel, and the field runs off the tile so the R – the radicand – is as
// large as the tile allows at 16 px. The hairline keeps the field's corner
// visible on a white toolbar; it is one device pixel at every size.
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><clipPath id="tile"><rect width="128" height="128" rx="28"/></clipPath></defs>
  <g clip-path="url(#tile)">
    <rect width="128" height="128" fill="#1f6fdc"/>
    <rect x="54" y="42" width="120" height="120" rx="20" fill="#ffffff"/>
    <text x="92" y="114" text-anchor="middle" font-family="Inter" font-weight="800" font-size="72" fill="#14233c">R</text>
    <path d="M10,86 L21,79 L33,113 L45.7,55.7 A29 29 0 0 1 74,33 H140" fill="none" stroke="#ffffff" stroke-width="10"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <rect x="${64 / size}" y="${64 / size}" width="${128 - 128 / size}" height="${128 - 128 / size}" rx="${28 - 64 / size}"
        fill="none" stroke="rgb(20 35 60 / 0.14)" stroke-width="${128 / size}"/>
</svg>`;

const browser = await launchBrowser();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><style>@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${inter}) format('woff2')}*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(size)}`,
  );
  await page.evaluate(() => document.fonts.load('800 72px Inter'));
  await page.screenshot({ path: path.join(OUT, `icon-${size}.png`), omitBackground: true });
  await page.close();
  console.log(`icon-${size}.png`);
}
await browser.close();
