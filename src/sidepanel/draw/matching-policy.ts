/**
 * Draw-to-find's matching policy: every tunable the ranking depends on,
 * in one dependency-free module. The runtime matcher (templates.ts) and
 * the generator's benchmark (scripts/generate-draw-prototypes.mjs) both
 * import it, so the published accuracy figures always describe the
 * matcher the app actually runs – and the generator can import this file
 * under Node's type-stripping without dragging in the prototype JSON.
 */

/**
 * A drawing whose BEST match scores above this is junk: show the no-match
 * state, never a list. The gate judges only the best score – the runner-up
 * candidates of a genuine drawing routinely score in the same range as a
 * scribble's best, so filtering the tail would strip real lists bare.
 * Calibrated on the committed held-out benchmark (npm run draw:benchmark)
 * with the stroke-count penalty in force: correct winners score p50 1.03 /
 * p90 1.57 / p95 1.79, random scribbles 1.93 and above. The two ranges
 * genuinely overlap – a very sloppy real drawing and a lucky scribble meet
 * around 1.9 – so the gate sits where sloppy-but-real drawings keep their
 * list and MOST scribbles are rejected; the odd scribble that scrapes
 * under shows a weak list, never a confident match.
 */
export const NO_MATCH_THRESHOLD = 1.95;
/** Best score at or below this reads as a confident match… */
export const CONFIDENT_THRESHOLD = 1.1;
/**
 * …provided the runner-up (ignoring exact ties) trails by at least this
 * much: a near-tie between different shapes is ambiguity, not confidence.
 * On the benchmark, wrong winners' margins sit at p50 0.12 while correct
 * ones reach p50 0.34; these two gates together read 83.9% of confident
 * verdicts correct over 26.4% of drawings – better on both axes than the
 * pre-penalty calibration (80.4% over 23.6%).
 */
export const CONFIDENT_MARGIN = 0.25;
/** Candidates shown at most. */
export const MAX_CANDIDATES = 5;

/** Coarse prefilter resolution and how many classes survive it. */
export const COARSE_SIZE = 16;
/**
 * Held at 24 while recognition ran on the main thread; with the matcher
 * in a worker the doubled fine stage buys real list quality – the coarse
 * gate's recall ceiling rises from 86.9% (at 24) to 92.8% (at 48) on the
 * held-out benchmark, and measured accuracy follows (see
 * bench-draw-recognition.mjs). Measured cost with the runtime's
 * early-abandon: ~320 ms per stroke against ~200 ms at 24 (Node, an
 * upper bound), inside the ~400 ms list-freshness budget and off the
 * main thread either way.
 */
export const SHORTLIST = 48;
/**
 * Coarse gating uses this many prototypes per class: the medoid plus the
 * widest-coverage prototype (selection stores them in that order), so the
 * gate sees the class's centre AND its most different accepted way of
 * being drawn.
 */
export const COARSE_PROTOTYPES = 2;

/**
 * The aspect-ratio term: proportions within the dead zone (about 1.4x
 * either way) cost nothing – people legitimately draw a symbol somewhat
 * wider or narrower – and beyond it a soft penalty grows, so a
 * natural-shaped reading outranks a heavily stretched one without a wide
 * drawing ever failing outright, while a bare dash (aspect far off any
 * symbol's) is pushed firmly down.
 */
const ASPECT_WEIGHT = 0.3;
const ASPECT_DEAD_ZONE = 0.35;

/** The penalty added to a drawing/prototype pair's cloud distance. */
export function aspectPenalty(drawingAspect: number, templateAspect: number): number {
  return (
    ASPECT_WEIGHT *
    Math.max(0, Math.abs(Math.log(drawingAspect / templateAspect)) - ASPECT_DEAD_ZONE)
  );
}

/**
 * The stroke-count term: $P is deliberately stroke-order and -direction
 * invariant, but stroke COUNT is strongly discriminative on the held-out
 * benchmark (the true class has a prototype with the drawing's stroke
 * count 95.7% of the time; wrong winners only 60.7%). A capped soft
 * penalty per prototype keeps it a preference, never a filter – some
 * people draw \pm in one stroke, some in two, and each prototype carries
 * its own count, so any accepted way of drawing a symbol stays reachable.
 * WEIGHT and CAP come from a full sweep on the held-out benchmark
 * (weights 0.06–0.28 × caps 1–3): 0.18/2 lifts top-1 51.6% → 54.9% and
 * top-3 74.1% → 77.7% at BENCH_N=4, within noise of the grid's best on
 * every metric while keeping the maximum penalty gentle.
 */
const STROKE_COUNT_WEIGHT = 0.18;
const STROKE_COUNT_CAP = 2;

/** The penalty added for a drawing/prototype stroke-count mismatch. */
export function strokeCountPenalty(drawnStrokes: number, templateStrokes: number): number {
  return STROKE_COUNT_WEIGHT * Math.min(STROKE_COUNT_CAP, Math.abs(drawnStrokes - templateStrokes));
}

/**
 * Classes a drawing genuinely cannot tell apart, though they are
 * different symbols: letter/operator twins (Π vs ∏), n-ary size variants
 * (∩ vs ⋂), long/short arrows, and identical-glyph pairs with different
 * meanings (⊥ vs ⟂). Merging them would be wrong – they insert different
 * commands – so the candidate list guarantees them ADJACENT rows instead:
 * when one is the best match, its twin is the next arrow-key press, never
 * possibly rank 9. Curated by hand from the held-out benchmark's
 * confusion list and the inter-class prototype distances; an automatic
 * distance threshold wide enough to cover the semantic twins starts
 * merging genuinely different symbols (see the research report).
 */
export const CANDIDATE_GROUPS: readonly (readonly string[])[] = [
  // Greek letters against the operators drawn the same way.
  ['\\Pi', '\\prod_{#?}^{#?}'],
  ['\\Sigma', '\\sum_{#?}^{#?}'],
  ['\\Delta', '\\triangle'],
  ['\\Lambda', '\\wedge', '\\bigwedge'],
  ['\\Theta', '\\ominus'],
  // Capital/small letters with the same drawn shape.
  ['\\Psi', '\\psi'],
  ['\\Upsilon', '\\upsilon'],
  // n-ary size variants.
  ['\\cap', '\\bigcap'],
  ['\\cup', '\\bigcup'],
  ['\\vee', '\\bigvee'],
  ['\\oplus', '\\bigoplus'],
  ['\\otimes', '\\bigotimes'],
  ['\\odot', '\\bigodot'],
  ['\\sqcup', '\\bigsqcup'],
  ['\\uplus', '\\biguplus'],
  ['\\amalg', '\\coprod'],
  ['\\degree', '\\circ'],
  // Long/short arrow variants.
  ['\\rightarrow', '\\longrightarrow'],
  ['\\mapsto', '\\longmapsto'],
  ['\\Rightarrow', '\\Longrightarrow'],
  ['\\Leftarrow', '\\Longleftarrow'],
  ['\\Leftrightarrow', '\\Longleftrightarrow'],
  // Identical or near-identical glyphs with different meanings.
  ['\\bot', '\\perp'],
  ['\\top', '\\intercal'],
  ['\\cdot', '\\cdotp'],
  ['\\cdots', '\\ldots'],
  ['\\backslash', '\\setminus'],
  ['\\diamondsuit', '\\lozenge'],
  ['\\lhd', '\\vartriangleleft'],
  ['\\lceil', '\\upharpoonright'],
  ['\\Lbag', '\\wr'],
];

const GROUP_PARTNERS = new Map<string, readonly string[]>();
for (const group of CANDIDATE_GROUPS) {
  for (const member of group) {
    GROUP_PARTNERS.set(
      member,
      group.filter((other) => other !== member),
    );
  }
}

/** The other members of `latex`'s group; empty for ungrouped classes. */
export function groupPartners(latex: string): readonly string[] {
  return GROUP_PARTNERS.get(latex) ?? [];
}

/**
 * Reorder a ranked candidate list so grouped classes sit on adjacent
 * rows: each candidate keeps its rank order except that its group
 * partners (in their own score order) are pulled up to follow it
 * immediately. Rank 1 never changes, so "best match" is untouched; a
 * top-1 miss onto a grouped twin becomes a one-arrow-key correction.
 */
export function groupAdjacently<T>(ranked: readonly T[], latexOf: (item: T) => string): T[] {
  const out: T[] = [];
  const emitted = new Set<number>();
  for (let i = 0; i < ranked.length; i++) {
    if (emitted.has(i)) continue;
    emitted.add(i);
    out.push(ranked[i]!);
    const partners = groupPartners(latexOf(ranked[i]!));
    if (partners.length === 0) continue;
    for (let j = i + 1; j < ranked.length; j++) {
      if (emitted.has(j) || !partners.includes(latexOf(ranked[j]!))) continue;
      emitted.add(j);
      out.push(ranked[j]!);
    }
  }
  return out;
}
