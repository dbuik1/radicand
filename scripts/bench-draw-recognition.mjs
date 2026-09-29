/**
 * Benchmark draw-to-find's matcher against the committed held-out fixture
 * (scripts/data/detexify-heldout.json.gz – real human drawings from the
 * Detexify data, extracted by scripts/extract-draw-benchmark.mjs).
 *
 * This is the acceptance harness for accuracy work on the matcher: it
 * needs no external data, imports the app's own recogniser and matching
 * policy, and mirrors templates.ts's two-stage scoring – so a change to
 * matching-policy.ts or recogniser.ts shows up here directly, and a change
 * to the scoring in templates.ts MUST be mirrored here (and in
 * generate-draw-prototypes.mjs's benchmark) in the same commit.
 *
 * Run manually – never part of the build:
 *
 *   npm run draw:benchmark                        # committed prototypes
 *   npm run draw:benchmark -- /path/to/protos.json # candidate prototypes
 *
 * Env knobs: BENCH_N caps drawings per class (default 4 – the published
 * figures' protocol; the fixture holds up to 12).
 *
 * Reference figures on the committed data at BENCH_N=4 (n=1,338):
 * top-1 56.8%, top-3 80.9%, top-5 86.0% (stroke-count penalty + twin
 * pruning/merging + grouped display order + SHORTLIST 48; the shipped
 * baseline before this work measured 51.6% / 74.1% / 80.3%).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { TWIN_CLASSES } from './prune-draw-prototypes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FIXTURE = path.join(ROOT, 'scripts', 'data', 'detexify-heldout.json.gz');
const PROTO_FILE =
  process.argv[2] ?? path.join(ROOT, 'src', 'assets', 'draw-prototypes.json');
const BENCH_N = Number(process.env.BENCH_N ?? 4);

const protoData = JSON.parse(readFileSync(PROTO_FILE, 'utf8'));
const fixture = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString('utf8'));
console.log(
  `prototypes: ${path.basename(PROTO_FILE)} – ${protoData.entries.length} classes, ` +
    `${(readFileSync(PROTO_FILE).length / 1024).toFixed(0)} KB`,
);

const compiled = protoData.entries.map((entry) => ({
  latex: entry.c,
  coarse: entry.p.map((strokes) => toCloud(strokes, 'preserve', COARSE_SIZE)),
  preserved: entry.p.map((strokes) => toCloud(strokes, 'preserve')),
  stretched: entry.p.map((strokes) => toCloud(strokes, 'stretch')),
  aspects: entry.p.map(boundingAspect),
  strokeCounts: entry.p.map((strokes) => strokes.length),
}));
const byLatex = new Map(compiled.map((template, index) => [template.latex, index]));

/** The coarse prefilter, ranked over every class (mirrors templates.ts). */
function coarseRank(strokes) {
  const coarse = toCloud(strokes, 'preserve', COARSE_SIZE);
  return compiled
    .map((template, index) => ({
      index,
      gate: Math.min(
        ...template.coarse.slice(0, COARSE_PROTOTYPES).map((cloud) => cloudDistance(coarse, cloud)),
      ),
    }))
    .sort((a, b) => a.gate - b.gate);
}

/** Fine dual-mode scoring with the penalties (mirrors templates.ts). */
function fineRank(strokes, indices) {
  const preserved = toCloud(strokes, 'preserve');
  const stretched = toCloud(strokes, 'stretch');
  const aspect = boundingAspect(strokes);
  return indices
    .map((index) => {
      const template = compiled[index];
      let score = Infinity;
      for (let i = 0; i < template.preserved.length; i++) {
        const inner = Math.min(
          cloudDistance(preserved, template.preserved[i]),
          cloudDistance(stretched, template.stretched[i]),
        );
        const penalty =
          aspectPenalty(aspect, template.aspects[i]) +
          strokeCountPenalty(strokes.length, template.strokeCounts[i]);
        score = Math.min(score, inner + penalty);
      }
      return { latex: template.latex, score };
    })
    .sort((a, b) => a.score - b.score);
}

const drawings = [];
for (const cls of fixture.classes) {
  // A fixture drawing of a pruned glyph twin counts for the kept twin –
  // the two render the same glyph, so the kept class winning IS correct.
  const latex = byLatex.has(cls.c) ? cls.c : (TWIN_CLASSES.get(cls.c) ?? cls.c);
  if (!byLatex.has(latex)) continue;
  for (const strokes of cls.test.slice(0, BENCH_N)) drawings.push({ latex, strokes });
}
console.log(
  `benchmarking ${drawings.length} held-out drawings ` +
    `(BENCH_N=${BENCH_N}) over ${compiled.length} classes…`,
);

const RECALL_K = [16, 24, 32, 48, 64, 96];
const recallHits = new Map(RECALL_K.map((k) => [k, 0]));
let top1 = 0;
let top3 = 0;
let top5 = 0;
const correctScores = [];
const correctMargins = [];
const wrongMargins = [];
const confusion = new Map();
const perClass = new Map();
let coarseMs = 0;
let fineMs = 0;
let strokeMatchTrue = 0;
let strokeMatchWrongWinner = 0;
let wrongTotal = 0;

for (const { latex, strokes } of drawings) {
  let t = performance.now();
  const ranked = coarseRank(strokes);
  coarseMs += performance.now() - t;
  const truthIndex = byLatex.get(latex);
  const coarsePos = ranked.findIndex((r) => r.index === truthIndex);
  for (const k of RECALL_K) {
    if (coarsePos >= 0 && coarsePos < k) recallHits.set(k, recallHits.get(k) + 1);
  }

  t = performance.now();
  // Grouped classes' partners are always scored, and the displayed order
  // groups them adjacently (both mirror templates.ts) – top-k describes
  // the candidate list the user actually traverses.
  const indices = ranked.slice(0, SHORTLIST).map((r) => r.index);
  const inShortlist = new Set(indices);
  for (const index of [...indices]) {
    for (const partner of groupPartners(compiled[index].latex)) {
      const partnerIndex = byLatex.get(partner);
      if (partnerIndex === undefined || inShortlist.has(partnerIndex)) continue;
      inShortlist.add(partnerIndex);
      indices.push(partnerIndex);
    }
  }
  const fine = fineRank(strokes, indices);
  fineMs += performance.now() - t;
  const displayed = groupAdjacently(fine, (r) => r.latex);
  const rank = displayed.findIndex((r) => r.latex === latex);
  if (rank === 0) top1++;
  if (rank >= 0 && rank < 3) top3++;
  if (rank >= 0 && rank < 5) top5++;

  const margin = fine.length > 1 ? fine[1].score - fine[0].score : Infinity;
  if (rank === 0) {
    correctScores.push(fine[0].score);
    correctMargins.push(margin);
  } else if (fine[0]) {
    wrongMargins.push(margin);
    wrongTotal++;
    confusion.set(
      `${latex} -> ${fine[0].latex}`,
      (confusion.get(`${latex} -> ${fine[0].latex}`) ?? 0) + 1,
    );
    if (compiled[byLatex.get(fine[0].latex)].strokeCounts.includes(strokes.length)) {
      strokeMatchWrongWinner++;
    }
  }
  if (compiled[truthIndex].strokeCounts.includes(strokes.length)) strokeMatchTrue++;

  const stats = perClass.get(latex) ?? { n: 0, hit: 0 };
  stats.n++;
  if (rank === 0) stats.hit++;
  perClass.set(latex, stats);
}

const pc = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]?.toFixed(2);
};
const total = drawings.length;

console.log(`\n=== accuracy (SHORTLIST=${SHORTLIST}) ===`);
console.log(`top-1 ${pc(top1, total)}  top-3 ${pc(top3, total)}  top-5 ${pc(top5, total)}  (n=${total})`);
console.log(`\n=== coarse prefilter recall (the fine stage's ceiling) ===`);
for (const k of RECALL_K) console.log(`  recall@${String(k).padStart(3)}  ${pc(recallHits.get(k), total)}`);
console.log(`\n=== score/margin distributions (for threshold calibration) ===`);
console.log(`correct winner score  p50 ${quantile(correctScores, 0.5)}  p90 ${quantile(correctScores, 0.9)}`);
console.log(`correct winner margin p50 ${quantile(correctMargins, 0.5)}`);
console.log(`wrong winner margin   p50 ${quantile(wrongMargins, 0.5)}`);
console.log(`\n=== stroke-count signal ===`);
console.log(`true class has a prototype with the drawing's stroke count: ${pc(strokeMatchTrue, total)}`);
console.log(`wrong winners do: ${pc(strokeMatchWrongWinner, wrongTotal)} (of ${wrongTotal} errors)`);
console.log(`\n=== timing (Node, this machine – upper bound, no early-abandon) ===`);
console.log(`coarse ${(coarseMs / total).toFixed(1)} ms/drawing, fine ${(fineMs / total).toFixed(1)} ms/drawing`);
console.log(`\n=== top confusions ===`);
[...confusion.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([pair, n]) => console.log(`  ${n}x  ${pair}`));
const zero = [...perClass.entries()].filter(([, s]) => s.hit === 0);
console.log(`\nclasses with 0 top-1 hits: ${zero.length} of ${perClass.size}`);
console.log(zero.slice(0, 40).map(([latex, s]) => `${latex}(0/${s.n})`).join('  '));
