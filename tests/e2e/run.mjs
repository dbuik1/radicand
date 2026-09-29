/**
 * E2E runner: builds the harness bundle, serves it, and runs every spec in
 * ./specs against headless Chromium. Exits non-zero on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveHarness, launchBrowser, openHarness } from './helpers.mjs';
import { viteBuild } from '../run-tool.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

console.log('Building e2e harness bundle...');
viteBuild(path.join(HERE, 'vite.config.ts'));

const specsDir = path.join(HERE, 'specs');
const specFiles = fs.readdirSync(specsDir).filter((f) => f.endsWith('.mjs')).sort();

const server = await serveHarness();
const browser = await launchBrowser();

let failures = 0;
for (const file of specFiles) {
  const mod = await import(pathToFileURL(path.join(specsDir, file)).href);
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== 'function') continue;
    const page = await openHarness(browser, server.url);
    try {
      await fn(page);
      console.log(`  ok    ${file} > ${name}`);
    } catch (error) {
      failures++;
      console.error(`  FAIL  ${file} > ${name}`);
      console.error(String(error?.message ?? error).replace(/^/gm, '        '));
    } finally {
      await page.close();
    }
  }
}

await browser.close();
await server.close();

if (failures > 0) {
  console.error(`\n${failures} e2e failure(s)`);
  process.exit(1);
}
console.log('\nAll e2e specs passed.');
