/**
 * Copy runtime assets out of node_modules into `public/` so they are bundled
 * with the extension and served locally.
 *
 * Why: several dependencies load data at runtime from a configurable directory.
 * For an offline extension that must make **no network requests** we bundle
 * them and point each library at the packaged copies:
 * - MathLive's KaTeX fonts and optional keypress sounds
 *   (`fontsDirectory` / `soundsDirectory`).
 * - Speech Rule Engine's locale "mathmaps". We ship only English
 *   (`base.json` + `en.json`) to keep the bundle lean – the UI is en-GB.
 *
 * The same run writes `public/THIRD-PARTY-NOTICES.txt`: every third-party
 * component that reaches `dist/` (MathLive, the KaTeX fonts, STIX Two Math,
 * Speech Rule Engine, MiniSearch) is redistributed under a licence that
 * requires its copyright notice and licence text to travel with each copy.
 * The file is assembled from the packages' own licence files so a dependency
 * bump can never ship a stale text; `scripts/check-no-network.mjs` fails the
 * build if it is missing from `dist/`.
 *
 * `public/` is git-ignored: these are vendored files regenerated from the
 * pinned dependencies on every install/build, so there is no need to commit
 * them.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const mathlive = resolve(root, 'node_modules', 'mathlive');
const sre = resolve(root, 'node_modules', 'speech-rule-engine');
const minisearch = resolve(root, 'node_modules', 'minisearch');

/** Whole-directory copies. */
const dirJobs = [
  { from: resolve(mathlive, 'fonts'), to: resolve(root, 'public', 'fonts') },
  { from: resolve(mathlive, 'sounds'), to: resolve(root, 'public', 'sounds') },
];

for (const { from, to } of dirJobs) {
  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}

/** Selected SRE locale maps (English only). */
const sreMaps = resolve(root, 'public', 'sre', 'mathmaps');
await rm(sreMaps, { recursive: true, force: true });
await mkdir(sreMaps, { recursive: true });
for (const file of ['base.json', 'en.json']) {
  const from = resolve(sre, 'lib', 'mathmaps', file);
  await cp(from, resolve(sreMaps, file));
  console.log(`copied ${from} -> ${resolve(sreMaps, file)}`);
}

/**
 * Third-party notices. Each entry names the component as the user sees it,
 * where it lives in the package, and the licence text it ships under.
 */
const version = async (pkg) =>
  JSON.parse(await readFile(resolve(root, 'node_modules', pkg, 'package.json'), 'utf8')).version;

// The STIX licence file opens with the STIX copyright header, then the full
// OFL 1.1 text from its first rule line; the KaTeX faces are under the same
// licence, so one copy of the text serves both font sets.
const stixLicence = await readFile(resolve(root, 'src', 'assets', 'fonts', 'OFL.txt'), 'utf8');
const oflStart = stixLicence.indexOf('-----');
if (oflStart < 0) throw new Error('src/assets/fonts/OFL.txt: OFL text not found after the STIX header');
const stixHeader = stixLicence.slice(0, oflStart).trim();
const oflText = stixLicence.slice(oflStart).trim();

// The KaTeX faces carry their copyright only inside the font binaries; this
// is that statement, with every face's name reserved as the OFL requires.
const katexHeader = [
  'Copyright (c) 2009-2010 Design Science, Inc.',
  'Copyright (c) 2014-2018 Khan Academy',
  'with Reserved Font Names "KaTeX_AMS", "KaTeX_Caligraphic", "KaTeX_Fraktur",',
  '"KaTeX_Main", "KaTeX_Math", "KaTeX_SansSerif", "KaTeX_Script", "KaTeX_Size1",',
  '"KaTeX_Size2", "KaTeX_Size3", "KaTeX_Size4" and "KaTeX_Typewriter".',
  '',
  'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
].join('\n');

const rule = (title) => `${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`;

const sections = [
  {
    title: `MathLive ${await version('mathlive')} – MIT License`,
    body: (await readFile(resolve(mathlive, 'LICENSE.txt'), 'utf8')).trim(),
  },
  {
    title: 'KaTeX fonts (dist/fonts/) and STIX Two Math (dist/assets/) – SIL Open Font License 1.1',
    body: `${katexHeader}\n\n${stixHeader}\n\n${oflText}`,
  },
  {
    title: `Speech Rule Engine ${await version('speech-rule-engine')} – Apache License 2.0`,
    body: (await readFile(resolve(sre, 'LICENSE'), 'utf8')).trim(),
  },
  {
    title: `MiniSearch ${await version('minisearch')} – MIT License`,
    body: (await readFile(resolve(minisearch, 'LICENSE.txt'), 'utf8')).trim(),
  },
];

const notices =
  'THIRD-PARTY NOTICES\n\n' +
  'This extension bundles the following components. Each is the property of\n' +
  'its copyright holders and is redistributed under the licence reproduced\n' +
  'beneath its name.\n\n' +
  sections.map(({ title, body }) => `${rule(title)}\n\n${body}\n`).join('\n') +
  '\n';

const noticesPath = resolve(root, 'public', 'THIRD-PARTY-NOTICES.txt');
await writeFile(noticesPath, notices);
console.log(`wrote ${noticesPath}`);
