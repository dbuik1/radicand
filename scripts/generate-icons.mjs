/**
 * Generate the extension icons (PNG, sizes 16/32/48/128) from an inline SVG,
 * rasterised with the Playwright-managed Chromium already used by the e2e
 * suite. Output: src/assets/icons/icon-<size>.png. Run: node scripts/generate-icons.mjs
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../tests/launch-browser.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

// A sky-blue radical sign over a white serif R – the radicand – on a dark
// ink ground. The thick stroke and bold capital keep it legible at 16 px.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="26" fill="#13233a"/>
  <path d="M16 70 L30 63 L46 98 L66 30 L110 30" fill="none" stroke="#7db8ff" stroke-width="11"
        stroke-linecap="round" stroke-linejoin="round"/>
  <text x="88" y="91" text-anchor="middle" font-family="'Times New Roman', 'Liberation Serif', Georgia, serif"
        font-weight="700" font-size="58" fill="#ffffff">R</text>
</svg>`;

const browser = await launchBrowser();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.goto(`data:text/html,<!doctype html><style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${encodeURIComponent(svg)}`);
  await page.screenshot({ path: path.join(OUT, `icon-${size}.png`), omitBackground: true });
  await page.close();
  console.log(`icon-${size}.png`);
}
await browser.close();
