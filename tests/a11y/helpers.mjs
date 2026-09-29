import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** Serve the built a11y dist on an ephemeral port. Returns { url, close }. */
export async function serveDist() {
  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/sidepanel/index.html';
    const file = path.join(DIST, urlPath);
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; res.end('not found'); return; }
      res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, r));
  return {
    url: `http://localhost:${server.address().port}/sidepanel/index.html`,
    close: () => new Promise((r) => server.close(r)),
  };
}

export { launchBrowser } from '../launch-browser.mjs';

/** Open the side panel page with optional theme, wait for math-field, and return the page. */
export async function openPanel(browser, url, theme) {
  const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
  await page.goto(url);
  await page.waitForSelector('math-field');
  await page.waitForTimeout(600); // let boot + MathLive settle
  // The panel collapses the Equation source disclosure by default; open
  // every disclosure so the audits cover its controls too (tab order, focus
  // visibility, target size, axe scans). The workspace's modes are opened
  // one at a time by the audits themselves.
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
  });
  await page.waitForTimeout(100);
  if (theme) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(100);
  }
  return page;
}
