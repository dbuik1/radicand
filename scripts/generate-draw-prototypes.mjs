/**
 * Generate draw-to-find's stroke prototypes (src/assets/draw-prototypes.json)
 * from the Detexify training data – crowdsourced human drawings of LaTeX
 * symbols, released under the ODbL (see docs/symbol-index-licences.md).
 *
 * Run manually – NEVER as part of the build (`npm run build` must work
 * offline). The data is not fetched automatically: download it from
 * github.com/kirel/detexify-data, unzip it, and point the script at the
 * folder:
 *
 *   npm run draw:prototypes -- "/path/to/detexify training data"
 *
 * Environment knobs (both optional): PROTOS overrides the prototypes kept
 * per class (default 4); BENCH_N the held-out drawings benchmarked per
 * class (default 6 – the published figures used BENCH_N=4).
 *
 * (the folder must hold detexify.sql.gz and symbols.json, as published at
 * github.com/kirel/detexify-data).
 *
 * What it does:
 * 1. Maps Detexify's symbol classes onto the commands this app inserts –
 *    only symbols the bundled MathLive renders AND the text search knows
 *    (so everything drawable is also searchable), with the same
 *    \mathcal → \mathscr substitution and placeholder templates.
 * 2. Streams the 210k-sample SQL dump, keeping a per-class reservoir for
 *    prototype selection and a deterministic held-out slice (id % 8 === 0)
 *    for benchmarking.
 * 3. Picks PROTOTYPES_PER_CLASS representative drawings per class –
 *    the medoid first, then greedy farthest-point coverage – using the
 *    app's own $P cloud distance.
 * 4. Benchmarks the two-stage matcher (coarse 16-point prefilter → fine
 *    comparison) on the held-out drawings and prints per-rank accuracy
 *    plus the score distributions the runtime thresholds are calibrated
 *    from.
 * 5. Writes the quantised prototypes JSON, which the runtime lazy-loads.
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertLatexToMarkup } from 'mathlive';
import { toCloud, cloudDistance, boundingAspect } from '../src/sidepanel/draw/recogniser.ts';
import {
  COARSE_SIZE,
  COARSE_PROTOTYPES,
  SHORTLIST,
  aspectPenalty,
  strokeCountPenalty,
  groupPartners,
  groupAdjacently,
} from '../src/sidepanel/draw/matching-policy.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'src', 'assets', 'draw-prototypes.json');

const DATA_DIR = process.argv[2];
if (!DATA_DIR) {
  console.error('usage: npm run draw:prototypes -- "/path/to/detexify training data"');
  process.exit(1);
}

const PROTOTYPES_PER_CLASS = Number(process.env.PROTOS ?? 4);
/** Enough drawings to trust a class; below this, people barely draw it. */
const MIN_TRAIN_SAMPLES = 25;
/** Reservoir cap per class for prototype selection. */
const TRAIN_CAP = 60;
/** Held-out drawings kept per class for the benchmark. */
const TEST_CAP = 12;
/**
 * Approximate total points stored per prototype (quantised to a 0..1000
 * grid), shared between its strokes by arc length – a one-stroke ∞ needs
 * the whole budget for its loops, while a three-stroke ∀ spends a third
 * per line. Rounding and the two-point floor per line stroke can push a
 * many-stroke prototype slightly over.
 */
const STORE_POINTS_TOTAL = 56;

// --------------------------------------------------------------- mapping
/** True when this MathLive build renders `latex` without an error atom. */
function renders(latex) {
  try {
    return !/ML__error/.test(convertLatexToMarkup(latex.replaceAll('#?', '\\placeholder{}')));
  } catch {
    return false;
  }
}

/**
 * Bare commands that the app inserts as placeholder templates (matching
 * the palette and the search index).
 */
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

/**
 * Human name for a search-index entry – the same rules as the search
 * results (symbol-search.ts displayName), so both lists agree.
 */
function displayName(entry) {
  const phrase =
    entry.d.split(';')[0]?.trim() ||
    (entry.a ?? '')
      .split(';')
      .map((part) => part.trim())
      .reduce((best, part) => (part.length > best.length ? part : best), '') ||
    entry.c;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** id → {latex, glyph, name} for every Detexify class this app can offer. */
function buildMapping() {
  const symbols = JSON.parse(
    readFileSync(path.join(DATA_DIR, 'symbols.json'), 'utf8'),
  );
  const index = JSON.parse(
    readFileSync(path.join(ROOT, 'src', 'assets', 'symbol-index.json'), 'utf8'),
  );
  const byCommand = new Map(index.entries.map((entry) => [entry.c, entry]));
  const mapping = new Map();
  let unmapped = 0;
  for (const symbol of symbols) {
    if (!symbol.mathmode) continue; // text-mode-only commands are not maths
    let latex = symbol.command
      .replace(/^\\mathcal\{/, '\\mathscr{') // MathML-safe, matching the app
      .replace(/\{\}$/, '') // Detexify writes argument commands as \sqrt{}
      .trim();
    latex = BARE_TO_TEMPLATE[latex] ?? latex;
    const entry = byCommand.get(latex);
    if (!entry || !renders(latex)) {
      unmapped++;
      continue;
    }
    mapping.set(symbol.id, { latex, glyph: entry.u, name: displayName(entry) });
  }
  console.log(`mapped ${mapping.size} Detexify classes (${unmapped} skipped: not in the search index or unrenderable)`);
  return mapping;
}

// ------------------------------------------------------------- streaming
/** Deterministic per-class subsampling without loading everything. */
function makeClassStore() {
  return { train: [], test: [], seen: 0 };
}

/** Decimate a stroke to at most `limit` points, keeping the endpoints. */
function decimate(stroke, limit) {
  if (limit < 2) return [stroke[0]];
  if (stroke.length <= limit) return stroke;
  const out = [];
  for (let i = 0; i < limit; i++) {
    out.push(stroke[Math.round((i * (stroke.length - 1)) / (limit - 1))]);
  }
  return out;
}

/** Parse one COPY row's strokes JSON into [[x,y]…] strokes, or null. */
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
  // Degenerate marks (a stray tap recorded as a whole sample) train nothing.
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

async function collect(mapping) {
  const classes = new Map(); // latex → store (Detexify twins pool together)
  const file = path.join(DATA_DIR, 'detexify.sql.gz');
  const lines = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let inCopy = false;
  let rows = 0;
  // Deterministic reservoir RNG, so reruns are reproducible.
  let seed = 2026;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
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
    const key = line.slice(tab1 + 1, tab2);
    const mapped = mapping.get(key);
    if (!mapped) continue;
    const strokes = parseStrokes(line.slice(tab2 + 1));
    if (!strokes) continue;
    let store = classes.get(mapped.latex);
    if (!store) {
      store = makeClassStore();
      store.meta = mapped;
      classes.set(mapped.latex, store);
    }
    if (id % 8 === 0) {
      // Held-out slice for the benchmark, never used for selection.
      if (store.test.length < TEST_CAP) store.test.push(strokes);
      continue;
    }
    store.seen++;
    if (store.train.length < TRAIN_CAP) {
      store.train.push(strokes);
    } else {
      const j = Math.floor(rand() * store.seen);
      if (j < TRAIN_CAP) store.train[j] = strokes;
    }
  }
  console.log(`streamed ${rows} rows into ${classes.size} mapped classes`);
  return classes;
}

// ---------------------------------------------------- prototype selection
/**
 * Medoid first (the most central drawing), then greedy farthest-point
 * additions: each new prototype is the drawing worst covered by the ones
 * already chosen, so the set spans the different ways people draw the
 * symbol rather than four near-copies.
 */
function selectPrototypes(samples) {
  const clouds = samples.map((strokes) => toCloud(strokes));
  const n = samples.length;
  const distances = Array.from({ length: n }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cloudDistance(clouds[i], clouds[j]);
      distances[i][j] = d;
      distances[j][i] = d;
    }
  }
  // Crowdsourced data carries junk (scribbles, half-finished drawings).
  // Rank every sample by its mean distance to the class and drop the worst
  // 30% BEFORE selecting – otherwise farthest-point coverage, which by
  // design seeks out the unusual, would enshrine exactly the junk.
  const meanDistances = Array.from({ length: n }, (_, i) => {
    let total = 0;
    for (let j = 0; j < n; j++) total += distances[i][j];
    return total / (n - 1 || 1);
  });
  const keepCount = Math.max(Math.min(PROTOTYPES_PER_CLASS, n), Math.floor(n * 0.7));
  const kept = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => meanDistances[a] - meanDistances[b])
    .slice(0, keepCount);
  let medoid = kept[0];
  const chosen = [medoid];
  while (chosen.length < Math.min(PROTOTYPES_PER_CLASS, kept.length)) {
    let farthest = -1;
    let farthestDistance = -1;
    for (const i of kept) {
      if (chosen.includes(i)) continue;
      let nearest = Infinity;
      for (const c of chosen) nearest = Math.min(nearest, distances[i][c]);
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthest = i;
      }
    }
    if (farthest === -1) break;
    chosen.push(farthest);
  }
  return chosen.map((i) => samples[i]);
}

/**
 * Normalise a drawing to a 0..1000 integer grid, sharing the point budget
 * between strokes by arc length (dots keep a single point, lines at least
 * their endpoints).
 */
function quantise(strokes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const [x, y] of stroke) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const lengthOf = (stroke) => {
    let total = 0;
    for (let i = 1; i < stroke.length; i++) {
      total += Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
    }
    return total;
  };
  const lengths = strokes.map(lengthOf);
  const totalLength = lengths.reduce((a, b) => a + b, 0) || 1;
  return strokes.map((stroke, index) => {
    const share =
      stroke.length === 1
        ? 1
        : Math.max(2, Math.round((lengths[index] / totalLength) * STORE_POINTS_TOTAL));
    return decimate(stroke, share).map(([x, y]) => [
      Math.round(((x - minX) / size) * 1000),
      Math.round(((y - minY) / size) * 1000),
    ]);
  });
}

// -------------------------------------------------------------- benchmark
/**
 * Replicates the runtime's two-stage matching (templates.ts): a coarse
 * 16-point prefilter over everything, then the full comparison over the
 * shortlist. Returns the ranked class list for one drawing.
 */
function makeMatcher(entries) {
  // The policy constants and the aspect penalty are IMPORTED from the
  // runtime (templates.ts), so this benchmark cannot drift from the
  // matcher the app actually runs.
  const compiled = entries.map((entry) => ({
    latex: entry.c,
    coarse: entry.p.map((strokes) => toCloud(strokes, 'preserve', COARSE_SIZE)),
    preserved: entry.p.map((strokes) => toCloud(strokes, 'preserve')),
    stretched: entry.p.map((strokes) => toCloud(strokes, 'stretch')),
    aspects: entry.p.map(boundingAspect),
    strokeCounts: entry.p.map((strokes) => strokes.length),
  }));
  const byLatex = new Map(compiled.map((template, index) => [template.latex, index]));
  return (strokes) => {
    const coarse = toCloud(strokes, 'preserve', COARSE_SIZE);
    const preserved = toCloud(strokes, 'preserve');
    const stretchedCloud = toCloud(strokes, 'stretch');
    const aspect = boundingAspect(strokes);
    const shortlisted = compiled
      .map((template) => ({
        template,
        coarse: Math.min(
          ...template.coarse.slice(0, COARSE_PROTOTYPES).map((c) => cloudDistance(coarse, c)),
        ),
      }))
      .sort((a, b) => a.coarse - b.coarse)
      .slice(0, SHORTLIST);
    // Grouped classes' partners are always scored (mirrors templates.ts).
    const inShortlist = new Set(shortlisted.map(({ template }) => template.latex));
    for (const { template } of [...shortlisted]) {
      for (const partner of groupPartners(template.latex)) {
        const partnerIndex = byLatex.get(partner);
        if (partnerIndex === undefined || inShortlist.has(partner)) continue;
        inShortlist.add(partner);
        shortlisted.push({ template: compiled[partnerIndex], coarse: Infinity });
      }
    }
    return shortlisted
      .map(({ template }) => {
        let score = Infinity;
        for (let i = 0; i < template.preserved.length; i++) {
          const penalty =
            aspectPenalty(aspect, template.aspects[i]) +
            strokeCountPenalty(strokes.length, template.strokeCounts[i]);
          score = Math.min(
            score,
            Math.min(
              cloudDistance(preserved, template.preserved[i]),
              cloudDistance(stretchedCloud, template.stretched[i]),
            ) + penalty,
          );
        }
        return { latex: template.latex, score };
      })
      .sort((a, b) => a.score - b.score);
  };
}

// -------------------------------------------------------------------- run
const mapping = buildMapping();
const classes = await collect(mapping);

const kept = [...classes.values()].filter(
  (store) => store.train.length >= MIN_TRAIN_SAMPLES,
);
console.log(`selecting prototypes for ${kept.length} classes with >= ${MIN_TRAIN_SAMPLES} drawings…`);

const entries = [];
let done = 0;
for (const store of kept) {
  const prototypes = selectPrototypes(store.train);
  entries.push({
    c: store.meta.latex,
    g: store.meta.glyph,
    n: store.meta.name,
    p: prototypes.map(quantise),
  });
  done++;
  if (done % 100 === 0) console.log(`  ${done}/${kept.length}`);
}
entries.sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : 0)); // codepoint order – locale-independent

console.log('benchmarking on held-out human drawings…');
const match = makeMatcher(entries);
const benchmarkedClasses = new Set();
let total = 0;
let top1 = 0;
let top3 = 0;
let top5 = 0;
const correctScores = [];
const wrongScores = [];
const correctMargins = [];
const wrongMargins = [];
for (const store of kept) {
  for (const strokes of store.test.slice(0, Number(process.env.BENCH_N ?? 6))) {
    const ranked = match(strokes);
    if (ranked.length === 0) continue;
    total++;
    benchmarkedClasses.add(store.meta.latex);
    // Top-k describes the displayed list: grouped classes sit adjacently
    // (mirrors templates.ts); score/margin stats stay on the raw ranking.
    const rank = groupAdjacently(ranked, (r) => r.latex).findIndex(
      (r) => r.latex === store.meta.latex,
    );
    if (rank === 0) top1++;
    if (rank >= 0 && rank < 3) top3++;
    if (rank >= 0 && rank < 5) top5++;
    (rank === 0 ? correctScores : wrongScores).push(ranked[0].score);
    const runner = ranked.find((r) => r.score > ranked[0].score + 1e-9);
    if (runner) (rank === 0 ? correctMargins : wrongMargins).push(runner.score - ranked[0].score);
  }
}
const pct = (a, p) => {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor(p * (b.length - 1))]?.toFixed(2);
};
console.log(
  `held-out accuracy over ${total} drawings, ${benchmarkedClasses.size} of ${entries.length} classes: ` +
    `top-1 ${((100 * top1) / total).toFixed(1)}%  top-3 ${((100 * top3) / total).toFixed(1)}%  top-5 ${((100 * top5) / total).toFixed(1)}%`,
);
console.log(
  `winning score when correct: p50 ${pct(correctScores, 0.5)} p90 ${pct(correctScores, 0.9)} | when wrong: p10 ${pct(wrongScores, 0.1)} p50 ${pct(wrongScores, 0.5)}`,
);
console.log(
  `runner-up margin when correct: p25 ${pct(correctMargins, 0.25)} p50 ${pct(correctMargins, 0.5)} | when wrong: p50 ${pct(wrongMargins, 0.5)} p90 ${pct(wrongMargins, 0.9)}`,
);
// Scribbles: random walks must land above the no-match gate.
{
  let seed2 = 7;
  const rand2 = () => { seed2 = (seed2 * 1664525 + 1013904223) % 4294967296; return seed2 / 4294967296; };
  const g2 = () => (rand2() + rand2() + rand2() + rand2() - 2) / 2;
  const junk = [];
  for (let s2 = 0; s2 < 12; s2++) {
    let x = 0.5, y = 0.5; const walk = [];
    for (let i = 0; i < 160; i++) { x = Math.min(1, Math.max(0, x + g2() * 0.18)); y = Math.min(1, Math.max(0, y + g2() * 0.18)); walk.push([x * 200, y * 200]); }
    junk.push(match([walk])[0]?.score ?? 99);
  }
  console.log(`scribble best score: min ${pct(junk, 0)} p50 ${pct(junk, 0.5)}`);
}

const output = {
  version: 1,
  sources:
    'Prototype drawings distilled from the Detexify training data ' +
    '(Daniel Kirsch, github.com/kirel/detexify-data), Open Database ' +
    'License (ODbL) 1.0. See docs/symbol-index-licences.md.',
  entries,
};
const serialised = JSON.stringify(output);
writeFileSync(OUT, serialised);
console.log(
  `wrote ${entries.length} classes × up to ${PROTOTYPES_PER_CLASS} prototypes to ${path.relative(ROOT, OUT)} – ${(serialised.length / 1024).toFixed(0)} KB`,
);
