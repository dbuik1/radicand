/**
 * Draw-to-find's symbol prototypes and matcher.
 *
 * The prototypes are real human drawings: for each symbol, a handful of
 * representative samples distilled from the Detexify training data (ODbL –
 * see docs/symbol-index-licences.md) by scripts/generate-draw-prototypes.mjs
 * and committed as src/assets/draw-prototypes.json. Every prototype class
 * is also in the text-search index, so anything drawable is searchable,
 * with the same insert commands, glyphs and names.
 *
 * Matching is two-stage, or a few hundred prototype comparisons per stroke
 * would stall the ink: a coarse 16-point $P pass over every class picks a
 * shortlist, then the full-resolution comparison – aspect-preserved and
 * stretch-invariant, whichever reads better, plus a soft aspect penalty –
 * ranks the shortlist. This module is lazy-loaded (with its data) on first
 * use of the draw region.
 */
import { toCloud, cloudDistance, boundingAspect } from './recogniser';
import type { Stroke, Cloud } from './recogniser';
import prototypeData from '../../assets/draw-prototypes.json';

export interface DrawCandidate {
  /** LaTeX inserted on activation; `#?` marks tab-navigable placeholders. */
  latex: string;
  /** The symbol's character, shown in the candidate row. */
  glyph: string;
  /** Accessible/visible name, matching the search results' naming. */
  name: string;
  /** Match distance – lower is closer; see the thresholds below. */
  score: number;
  /** False when pruning clipped the score (it is then only a lower bound). */
  exact?: boolean;
}

interface PrototypeEntry {
  c: string;
  g: string;
  n: string;
  /** Prototype drawings, each strokes of [x, y] points on a 0..1000 grid. */
  p: number[][][][];
}

// The tunables live in matching-policy.ts (shared with the generator's
// benchmark) and are re-exported here for the module's consumers.
export {
  NO_MATCH_THRESHOLD,
  CONFIDENT_THRESHOLD,
  CONFIDENT_MARGIN,
  MAX_CANDIDATES,
} from './matching-policy';
import {
  NO_MATCH_THRESHOLD,
  CONFIDENT_THRESHOLD,
  CONFIDENT_MARGIN,
  MAX_CANDIDATES,
  COARSE_SIZE,
  COARSE_PROTOTYPES,
  SHORTLIST,
  aspectPenalty,
  strokeCountPenalty,
  groupPartners,
  groupAdjacently,
} from './matching-policy';

interface CompiledClass {
  latex: string;
  glyph: string;
  name: string;
  coarse: Cloud[];
  /** Aspect-preserving clouds: noise-robust, stretch-intolerant. */
  preserved: Cloud[];
  /** Per-axis-normalised clouds: stretch-invariant. */
  stretched: Cloud[];
  aspects: number[];
  strokeCounts: number[];
}

function compile(entry: PrototypeEntry): CompiledClass {
  const drawings: Stroke[][] = entry.p.map((strokes) =>
    strokes.map((stroke) => stroke.map(([x, y]) => [x!, y!] as const)),
  );
  return {
    latex: entry.c,
    glyph: entry.g,
    name: entry.n,
    coarse: drawings.map((strokes) => toCloud(strokes, 'preserve', COARSE_SIZE)),
    preserved: drawings.map((strokes) => toCloud(strokes, 'preserve')),
    stretched: drawings.map((strokes) => toCloud(strokes, 'stretch')),
    aspects: drawings.map((strokes) => boundingAspect(strokes)),
    strokeCounts: drawings.map((strokes) => strokes.length),
  };
}

/**
 * The dataset's ODbL attribution notice. Exported and attached to the live
 * interface (see draw-find.ts) so it survives into the shipped bundle – a
 * static JSON import is tree-shaken to the fields actually referenced.
 */
export const DATA_NOTICE: string = prototypeData.sources;

/**
 * Prototype clouds are compiled lazily (~180 ms for 1,360 prototypes):
 * doing it at module evaluation would block the click that opens the draw
 * region, since the dynamic import resolves inside that handler. warmUp()
 * lets the caller spend the cost during idle time instead of on the first
 * stroke.
 */
let compiledClasses: CompiledClass[] | null = null;
let compiledByLatex: Map<string, CompiledClass> | null = null;

function getCompiled(): CompiledClass[] {
  compiledClasses ??= (prototypeData.entries as PrototypeEntry[]).map(compile);
  return compiledClasses;
}

function getCompiledByLatex(): Map<string, CompiledClass> {
  compiledByLatex ??= new Map(getCompiled().map((template) => [template.latex, template]));
  return compiledByLatex;
}

/** Precompile the prototype clouds (idempotent). */
export function warmUp(): void {
  getCompiled();
}

/**
 * Every drawable symbol ranked against a drawing, unfiltered beyond the
 * coarse shortlist (plus the shortlisted classes' group partners, which
 * are always scored so the adjacency guarantee never lacks a row). The
 * calibration tests use this; the UI goes through
 * {@link recogniseStrokes}.
 */
function rankStrokes(strokes: readonly Stroke[]): DrawCandidate[] {
  if (strokes.length === 0) return [];
  const coarse = toCloud(strokes, 'preserve', COARSE_SIZE);
  const preserved = toCloud(strokes, 'preserve');
  const stretched = toCloud(strokes, 'stretch');
  const aspect = boundingAspect(strokes);

  const shortlist = getCompiled()
    .map((template) => ({
      template,
      gate: Math.min(
        ...template.coarse
          .slice(0, COARSE_PROTOTYPES)
          .map((cloud) => cloudDistance(coarse, cloud)),
      ),
    }))
    .sort((a, b) => a.gate - b.gate)
    .slice(0, SHORTLIST);

  // A grouped class's partners always get scored, even when the coarse
  // gate dropped them – otherwise "the twin is the next row" would have
  // no row to offer.
  const shortlisted = new Set(shortlist.map(({ template }) => template.latex));
  for (const { template } of [...shortlist]) {
    for (const partner of groupPartners(template.latex)) {
      if (shortlisted.has(partner)) continue;
      const partnerClass = getCompiledByLatex().get(partner);
      if (!partnerClass) continue;
      shortlisted.add(partner);
      shortlist.push({ template: partnerClass, gate: Infinity });
    }
  }

  // Rank the shortlist with cross-template pruning: once the displayed top
  // is full, a comparison that cannot enter it is abandoned early (the
  // shortlist arrives best-gate-first, so the bound tightens quickly). The
  // displayed candidates stay exact; a clipped score is only a LOWER
  // bound, so clipped entries are marked inexact and excluded from the
  // plausible-match count (a slight undercount, never an overcount).
  const scores: number[] = [];
  const ranked = shortlist.map(({ template }) => {
    const kept = [...scores].sort((a, b) => a - b);
    const bound = (kept[MAX_CANDIDATES] ?? Infinity) + 0.01;
    let score = Infinity;
    for (let i = 0; i < template.preserved.length; i++) {
      const penalty =
        aspectPenalty(aspect, template.aspects[i]!) +
        strokeCountPenalty(strokes.length, template.strokeCounts[i]!);
      // The penalty is fixed before any distance work, so it tightens the
      // abandon bound: a comparison only matters below bound − penalty.
      const innerBound = bound - penalty;
      if (innerBound <= 0) continue; // cannot enter the displayed top
      // The stretched reading only matters when it beats the preserved one,
      // so it inherits that result as a further bound.
      const preservedDistance = cloudDistance(preserved, template.preserved[i]!, innerBound);
      const inner = Math.min(
        preservedDistance,
        cloudDistance(stretched, template.stretched[i]!, Math.min(innerBound, preservedDistance)),
      );
      score = Math.min(score, inner + penalty);
    }
    scores.push(score);
    return {
      latex: template.latex,
      glyph: template.glyph,
      name: template.name,
      score,
      exact: score < bound,
    };
  });
  return ranked.sort((a, b) => a.score - b.score);
}

export interface DrawRecognition {
  /** Top candidates (at most MAX_CANDIDATES); empty means no close match. */
  candidates: DrawCandidate[];
  /**
   * How many symbols score as plausible, counting exactly-scored ones only
   * – a floor, not a total, and never more than the shortlist.
   */
  matches: number;
  /** The best match is close AND clear of any differently-shaped runner-up. */
  confident: boolean;
}

/**
 * Rank the drawable symbols against a drawing. No candidates means "no
 * close match": nothing scored below the no-match threshold. Otherwise the
 * top MAX_CANDIDATES, weaker runners-up included – the ranking, not an
 * absolute score, is what the candidate list presents – plus the count of
 * plausible matches for the status line and the confidence verdict.
 */
export function recogniseStrokes(strokes: readonly Stroke[]): DrawRecognition {
  const ranked = rankStrokes(strokes);
  if (
    ranked.length === 0 ||
    !Number.isFinite(ranked[0]!.score) ||
    ranked[0]!.score > NO_MATCH_THRESHOLD
  ) {
    return { candidates: [], matches: 0, confident: false };
  }
  const best = ranked[0]!;
  const runnerUp = ranked.find((candidate) => candidate.score > best.score + 1e-9);
  return {
    // Grouped classes take adjacent rows (best match never moves), so a
    // top answer's inseparable twin is one arrow key away, never rank 9.
    candidates: groupAdjacently(ranked, (candidate) => candidate.latex).slice(0, MAX_CANDIDATES),
    matches: ranked.filter(
      (candidate) => candidate.exact !== false && candidate.score <= NO_MATCH_THRESHOLD,
    ).length,
    confident:
      best.score <= CONFIDENT_THRESHOLD &&
      (runnerUp === undefined || runnerUp.score - best.score >= CONFIDENT_MARGIN),
  };
}
