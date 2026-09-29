/**
 * Guard: the built extension must not introduce new external network
 * references – the product's hard "no network requests at runtime" invariant.
 *
 * A purely static scan cannot prove the absence of *runtime* fetches, but it
 * gives strong regression protection: it fails if any external host appears
 * anywhere in the built output that is not on the explicitly justified
 * allowlist below. Combined with a manual DevTools Network check on the loaded
 * extension, this keeps the offline guarantee honest as dependencies change.
 *
 * Each allowlisted host is an **inert** reference verified by inspection – a
 * string in an error message, an unsupported-browser fallback, or a default we
 * override at runtime.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

/**
 * The third-party licence file written by scripts/copy-mathlive-assets.mjs.
 * Licence texts quote their canonical URLs (apache.org, scripts.sil.org); the
 * file is plain text that no code loads, so it is exempt from the host scan
 * and checked for its required notices instead.
 */
const NOTICES = 'THIRD-PARTY-NOTICES.txt';

/** Host -> why it is inert (never fetched at runtime). */
const ALLOWED = {
  'www.w3.org': 'XML namespace URIs (MathML/SVG) – identifiers, never fetched.',
  'esm.run':
    'String inside a MathLive "library not loaded" error message; compute-engine is bundled, so it never fires.',
  'www.npmjs.com':
    'String in a console.error for the Amazon speech engine, which we never select (we use local SRE).',
  'cdn.jsdelivr.net':
    "SRE's default map path and IE-only fallbacks; the panel pre-seeds the global SREfeature.json with the bundled local copy BEFORE SRE loads (src/sidepanel/speech.ts), so the CDN path is never used – setupEngine({ json }) alone would be too late, as SRE starts loading at module-init. Verified at runtime by tests/ext.",
};

/** Text file types worth scanning; source maps and binary assets are skipped. */
const SCANNABLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.txt', '.webmanifest']);

/** Every scannable file under `dir`, recursively. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (SCANNABLE.has(extname(entry)) && !entry.endsWith('.map') && entry !== NOTICES) {
      yield path;
    }
  }
}

const offenders = new Map();

for (const file of walk(distDir)) {
  const contents = readFileSync(file, 'utf8');
  // http(s) and websocket URLs alike – any absolute external reference.
  const matches =
    contents.match(/(?:https?|wss?):\/\/[a-zA-Z0-9._~:/?#@!$&()*+,;=%-]+/g) ?? [];
  for (const url of matches) {
    let host;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    if (host in ALLOWED) continue;
    if (!offenders.has(host)) offenders.set(host, new Set());
    offenders.get(host).add(file.slice(distDir.length + 1));
  }
}

if (offenders.size > 0) {
  console.error('✗ no-network check failed: unexpected external host(s) found:');
  for (const [host, files] of offenders) {
    console.error(`  - ${host}  (in ${[...files].join(', ')})`);
  }
  console.error(
    '\nIf this reference is genuinely inert, add it to the justified allowlist\n' +
      'in scripts/check-no-network.mjs. Otherwise remove the network dependency.',
  );
  process.exit(1);
}

console.log('✓ no-network check passed: only justified, inert external references present.');

// Licence-compliance guard: the bundled data files carry attribution
// notices that MUST survive bundling (a static JSON import is tree-shaken
// to the fields the code references – see draw/templates.ts DATA_NOTICE).
{
  const assetDir = join(distDir, 'assets');
  const bundles = readdirSync(assetDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(assetDir, name), 'utf8'))
    .join('\n');
  const required = ['ODbL', 'unimathsymbols'];
  const missing = required.filter((marker) => !bundles.includes(marker));
  if (missing.length > 0) {
    console.error(
      `✗ attribution check failed: ${missing.join(', ')} notice missing from the built bundles – ` +
        'a data attribution was tree-shaken away. See docs/symbol-index-licences.md.',
    );
    process.exit(1);
  }
  console.log('✓ attribution check passed: bundled data notices survive into dist/.');
}

// Licence-compliance guard: every third-party component shipped in dist/
// (MathLive, the KaTeX fonts, STIX Two Math, Speech Rule Engine, MiniSearch)
// must travel with its copyright notice and licence text. The markers are one
// copyright holder or licence title per component, so a dropped section or
// an empty file fails the build.
{
  const noticesPath = join(distDir, NOTICES);
  if (!existsSync(noticesPath)) {
    console.error(
      `✗ third-party notices check failed: dist/${NOTICES} is missing – ` +
        'scripts/copy-mathlive-assets.mjs writes it into public/ before every build.',
    );
    process.exit(1);
  }
  const notices = readFileSync(noticesPath, 'utf8');
  const required = [
    'Arno Gourdol',
    'Khan Academy',
    'STIX Fonts Project',
    'SIL OPEN FONT LICENSE',
    'Apache License',
    'Luca Ongaro',
  ];
  const missing = required.filter((marker) => !notices.includes(marker));
  if (missing.length > 0) {
    console.error(
      `✗ third-party notices check failed: ${missing.join(', ')} missing from dist/${NOTICES} – ` +
        'a bundled component has lost its licence notice.',
    );
    process.exit(1);
  }
  console.log(`✓ third-party notices check passed: dist/${NOTICES} carries every bundled licence.`);
}
