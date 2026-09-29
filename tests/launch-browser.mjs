/**
 * Shared headless-Chromium launcher for the e2e, a11y and extension suites,
 * tolerating environments without a Playwright-downloaded browser (CI
 * containers, system Chromium installs). Set CHROME_PATH to force a specific
 * binary.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const CANDIDATES = [
  process.env.CHROME_PATH,
  // A pre-provisioned browser store (e.g. a CI image) often carries a stable
  // `chromium` entry point even when its revision differs from the one this
  // Playwright version would download.
  process.env.PLAYWRIGHT_BROWSERS_PATH &&
    `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

/**
 * Run `launch` with Playwright's own browser resolution first (executablePath
 * undefined), then retry with each candidate executable. The one home for the
 * fallback policy, shared by both launchers below.
 */
async function withExecutableFallback(launch) {
  try {
    return await launch(undefined);
  } catch (error) {
    for (const executablePath of CANDIDATES) {
      if (!fs.existsSync(executablePath)) continue;
      try {
        return await launch(executablePath);
      } catch {
        /* try next */
      }
    }
    throw error;
  }
}

export function launchBrowser() {
  return withExecutableFallback((executablePath) =>
    chromium.launch({ executablePath, args: ['--no-sandbox'] }),
  );
}

/**
 * Launch a persistent context with an unpacked extension loaded from
 * `extensionDir` – how the extension smoke lane (tests/ext) drives the real
 * built extension. Extensions only work in the FULL Chromium binary's new
 * headless mode: a bare `headless: true` would make Playwright pick its
 * extension-incapable headless shell, so the first attempt pins
 * `channel: 'chromium'` (the full binary). The fallback candidates are full
 * Chromium builds already; `channel` must be omitted alongside an explicit
 * executable.
 */
export function launchExtensionContext(extensionDir, userDataDir) {
  const args = [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    '--no-sandbox',
  ];
  return withExecutableFallback((executablePath) =>
    chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args,
      ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    }),
  );
}
