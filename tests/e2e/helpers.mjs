import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** Serve the built harness on an ephemeral port. Returns { url, close }. */
export async function serveHarness() {
  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/harness.html';
    const file = path.join(DIST, urlPath);
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; res.end('not found'); return; }
      res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, r));
  return {
    url: `http://localhost:${server.address().port}/harness.html`,
    close: () => new Promise((r) => server.close(r)),
  };
}

export { launchBrowser } from '../launch-browser.mjs';

/** Open the harness page and wait until the editor is mounted. */
/**
 * Wait until the field's keyboard sink holds focus. MathLive's `focus()`
 * marks the field focused at once but moves focus to the sink in a timer,
 * and a keystroke sent before that is lost. Call it after focusing the
 * field and before pressing keys.
 */
export async function fieldTakesKeys(page) {
  try {
    await page.waitForFunction(
      () =>
        document.activeElement === window.__mf &&
        window.__mf.shadowRoot?.activeElement?.classList.contains('ML__keyboard-sink') === true,
      undefined,
      { timeout: 5000 },
    );
  } catch {
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` : 'nothing';
    });
    throw new Error(`the equation never took keyboard focus (focus is on ${where})`);
  }
}

export async function openHarness(browser, url) {
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForFunction('window.__ready === true');
  await page.waitForTimeout(400); // let MathLive settle
  // Warm-up: the very first keystroke after load can be swallowed.
  await page.evaluate(() => { window.__mf.focus(); });
  await fieldTakesKeys(page);
  await page.keyboard.press('x');
  await page.waitForTimeout(50);
  await page.evaluate(() => { window.__mf.setValue(''); });
  await page.waitForTimeout(50);
  return page;
}

export const latex = (page) => page.evaluate(() => window.__mf.getValue('latex'));
export const position = (page) => page.evaluate(() => window.__mf.position);

/**
 * Poll the field until its LaTeX equals `expected` (a string) or matches it
 * (a RegExp), then return the value. The editor's own timers (auto-accept,
 * boxing) run at the user's command delay, so a spec waits for the value it
 * expects rather than for a fixed time. Gives up after `timeout` ms and
 * returns whatever the field holds, so the caller's assertion reports the
 * actual value.
 */
export async function settled(page, expected, { timeout = 2000 } = {}) {
  const probe =
    expected instanceof RegExp
      ? { source: expected.source, flags: expected.flags }
      : { exact: expected };
  await page
    .waitForFunction(
      ({ source, flags, exact }) => {
        const value = window.__mf.getValue('latex');
        return exact !== undefined ? value === exact : new RegExp(source, flags).test(value);
      },
      probe,
      { timeout, polling: 25 },
    )
    .catch(() => {});
  return latex(page);
}

/** Reset the field and insert a template the way the palette does. */
export async function insertTemplate(page, template) {
  await page.evaluate((t) => {
    window.__mf.setValue('');
    window.__mf.focus();
    window.__editor.insert(t);
  }, template);
  await page.waitForTimeout(40);
}

/** Press Backspace once and settle. */
export async function backspace(page) {
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(30);
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

export function assertMatch(actual, re, label) {
  if (!re.test(actual)) {
    throw new Error(`${label}\n  expected match: ${re}\n  actual: ${JSON.stringify(actual)}`);
  }
}
