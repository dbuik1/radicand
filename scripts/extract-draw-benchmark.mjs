/**
 * Extract draw-to-find's held-out benchmark fixture
 * (scripts/data/detexify-heldout.json.gz) from the Detexify training data.
 *
 * The fixture is the deterministic held-out slice (sample id % 8 === 0,
 * capped at 12 drawings per class) of the same class mapping that
 * generate-draw-prototypes.mjs uses, stored with the original coordinates
 * untouched. It exists so that accuracy work on the matcher
 * (scripts/bench-draw-recognition.mjs) can run against real human drawings
 * without the 214 MB Detexify dump, which is not kept in this repository.
 *
 * Run manually – NEVER as part of the build. Only needed again if the
 * class mapping or the search index changes; download the data from
 * github.com/kirel/detexify-data first:
 *
 *   npm run draw:heldout -- "/path/to/detexify training data"
 *
 * (the folder must hold detexify.sql.gz and symbols.json). The mapping,
 * parsing and split below MUST stay in step with
 * generate-draw-prototypes.mjs – the fixture is only honest while both
 * derive the same classes and the same held-out slice.
 *
 * The fixture is an ODbL 1.0 derivative of the Detexify data, like
 * src/assets/draw-prototypes.json – see docs/symbol-index-licences.md.
 */
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip, gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertLatexToMarkup } from 'mathlive';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'scripts', 'data', 'detexify-heldout.json.gz');

const DATA_DIR = process.argv[2];
if (!DATA_DIR) {
  console.error('usage: npm run draw:heldout -- "/path/to/detexify training data"');
  process.exit(1);
}

/** Held-out drawings kept per class (matches the generator's TEST_CAP). */
const TEST_CAP = 12;
/** Class floor (matches the generator's MIN_TRAIN_SAMPLES). */
const MIN_TRAIN_SAMPLES = 25;

// ------------------------------------------------------ mapping (mirrored)
function renders(latex) {
  try {
    return !/ML__error/.test(convertLatexToMarkup(latex.replaceAll('#?', '\\placeholder{}')));
  } catch {
    return false;
  }
}

const BARE_TO_TEMPLATE = {
  '\\sum': '\\sum_{#?}^{#?}',
  '\\prod': '\\prod_{#?}^{#?}',
  '\\int': '\\int_{#?}^{#?}',
  '\\iint': '\\iint_{#?}^{#?}',
  '\\iiint': '\\iiint_{#?}^{#?}',
  '\\oint': '\\oint_{#?}^{#?}',
  '\\lim': '\\lim_{#?}',
  '\\sqrt': '\\sqrt{#?}',
  '\\frac': '\\frac{#?}{#?}',
  '\\binom': '\\binom{#?}{#?}',
  '\\vec': '\\vec{#?}',
  '\\hat': '\\hat{#?}',
  '\\bar': '\\bar{#?}',
  '\\dot': '\\dot{#?}',
  '\\ddot': '\\ddot{#?}',
  '\\tilde': '\\tilde{#?}',
  '\\overline': '\\overline{#?}',
  '\\underline': '\\underline{#?}',
  '\\widehat': '\\widehat{#?}',
  '\\overbrace': '\\overbrace{#?}^{#?}',
  '\\underbrace': '\\underbrace{#?}_{#?}',
};

function buildMapping() {
  const symbols = JSON.parse(readFileSync(path.join(DATA_DIR, 'symbols.json'), 'utf8'));
  const index = JSON.parse(
    readFileSync(path.join(ROOT, 'src', 'assets', 'symbol-index.json'), 'utf8'),
  );
  const byCommand = new Map(index.entries.map((entry) => [entry.c, entry]));
  const mapping = new Map();
  for (const symbol of symbols) {
    if (!symbol.mathmode) continue;
    let latex = symbol.command
      .replace(/^\\mathcal\{/, '\\mathscr{')
      .replace(/\{\}$/, '')
      .trim();
    latex = BARE_TO_TEMPLATE[latex] ?? latex;
    const entry = byCommand.get(latex);
    if (!entry || !renders(latex)) continue;
    mapping.set(symbol.id, latex);
  }
  console.log(`mapped ${mapping.size} Detexify classes`);
  return mapping;
}

// ---------------------------------------------------- streaming (mirrored)
function decimate(stroke, limit) {
  if (limit < 2) return [stroke[0]];
  if (stroke.length <= limit) return stroke;
  const out = [];
  for (let i = 0; i < limit; i++) {
    out.push(stroke[Math.round((i * (stroke.length - 1)) / (limit - 1))]);
  }
  return out;
}

function parseStrokes(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 30) return null;
  const strokes = raw
    .filter((stroke) => Array.isArray(stroke) && stroke.length > 0)
    .map((stroke) => decimate(stroke.map(([x, y]) => [x, y]), 64));
  if (strokes.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const [x, y] of stroke) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX - minX < 4 && maxY - minY < 4) return null;
  return strokes;
}

const mapping = buildMapping();
const classes = new Map();
const lines = createInterface({
  input: createReadStream(path.join(DATA_DIR, 'detexify.sql.gz')).pipe(createGunzip()),
  crlfDelay: Infinity,
});
let inCopy = false;
let rows = 0;
for await (const line of lines) {
  if (!inCopy) {
    if (line.startsWith('COPY samples')) inCopy = true;
    continue;
  }
  if (line === '\\.') break;
  rows++;
  const tab1 = line.indexOf('\t');
  const tab2 = line.indexOf('\t', tab1 + 1);
  const id = Number(line.slice(0, tab1));
  const latex = mapping.get(line.slice(tab1 + 1, tab2));
  if (!latex) continue;
  let store = classes.get(latex);
  if (!store) {
    store = { test: [], trainSeen: 0, raw: 0 };
    classes.set(latex, store);
  }
  store.raw++;
  const strokes = parseStrokes(line.slice(tab2 + 1));
  if (!strokes) continue;
  if (id % 8 === 0) {
    if (store.test.length < TEST_CAP) store.test.push(strokes);
    continue;
  }
  store.trainSeen++;
}
console.log(`streamed ${rows} rows into ${classes.size} mapped classes`);

// Same class floor as the generator, judged on the same pool: classes with
// too few training drawings never get prototypes, so benchmarking them
// would measure nothing the app ships.
const kept = [...classes.entries()]
  .filter(([, store]) => store.trainSeen >= MIN_TRAIN_SAMPLES)
  .sort(([a], [b]) => (a < b ? -1 : 1));

const fixture = {
  version: 1,
  sources:
    'Held-out human drawings from the Detexify training data (Daniel Kirsch, ' +
    'github.com/kirel/detexify-data), Open Database License (ODbL) 1.0. ' +
    'See docs/symbol-index-licences.md.',
  split: `sample id % 8 === 0, first ${TEST_CAP} parseable drawings per class`,
  classes: kept.map(([latex, store]) => ({
    c: latex,
    seen: store.trainSeen,
    raw: store.raw,
    test: store.test,
  })),
};

mkdirSync(path.dirname(OUT), { recursive: true });
const gz = gzipSync(JSON.stringify(fixture), { level: 9 });
writeFileSync(OUT, gz);
const drawings = kept.reduce((n, [, store]) => n + store.test.length, 0);
console.log(
  `wrote ${kept.length} classes, ${drawings} held-out drawings to ${OUT} (${(gz.length / 1024).toFixed(0)} KB gz)`,
);
