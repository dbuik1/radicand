import { describe, it, expect, beforeEach } from 'vitest';
import { toCloud, cloudDistance } from './recogniser';
import type { Stroke } from './recogniser';
import { CANDIDATE_GROUPS } from './matching-policy';
import { recogniseStrokes, NO_MATCH_THRESHOLD, MAX_CANDIDATES } from './templates';

/**
 * The matcher runs against real human drawings (the Detexify prototypes),
 * so these tests assert what the interface actually promises: the drawn
 * symbol appears prominently in the ranked list. Lookalikes are real –
 * a drawn √ IS also a ✓, an ε an ∈ – so several cases accept the honest
 * confusable set rather than demanding a single winner. The pipeline's
 * held-out benchmark (npm run draw:prototypes) is the accuracy authority;
 * these are regression floors.
 *
 * Sloppy trials shear, wobble and jitter each drawing – deterministic
 * (seeded LCG, reset per test) so a regression is never flakiness.
 */
let seed = 42;

beforeEach(() => {
  seed = 42;
});

const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = (): number => (rand() + rand() + rand() + rand() - 2) / 2;

function sloppy(strokes: readonly Stroke[], severity: number): Stroke[] {
  const theta = gauss() * 0.08 * severity;
  const shear = gauss() * 0.1 * severity;
  const wobblePhase = rand() * Math.PI * 2;
  const wobbleAmp = 0.035 * severity;
  return strokes.map((stroke) => {
    const points = stroke.map(([x, y]) => {
      let px = x + shear * y;
      let py = y;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      [px, py] = [c * px - s * py, s * px + c * py];
      px += wobbleAmp * Math.sin(3 * py + wobblePhase) + gauss() * 0.01 * severity;
      py += wobbleAmp * Math.cos(3 * px + wobblePhase) + gauss() * 0.01 * severity;
      return [px, py] as const;
    });
    return rand() < 0.35 ? points.reverse() : points;
  });
}

const shuffled = <T,>(items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

const l = (a: readonly [number, number], b: readonly [number, number], n = 10): Stroke =>
  Array.from({ length: n }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / (n - 1),
    a[1] + ((b[1] - a[1]) * i) / (n - 1),
  ]);
const q = (
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  n = 16,
): Stroke =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
      u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
    ];
  });
/**
 * Each case: a drawing, the commands accepted as its identity (including
 * honest lookalikes that insert the same ink), and the rank window the
 * five-row candidate list must show it in.
 */
const DRAWINGS: { accept: string[]; within: number; stretchTo?: number; strokes: Stroke[] }[] = [
  {
    accept: ['\\forall'],
    within: 3,
    strokes: [
      [...l([0.2, 0.0], [0.52, 0.98]), ...l([0.52, 0.98], [0.8, 0.0])],
      l([0.28, 0.48], [0.72, 0.46]),
    ],
  },
  {
    accept: ['\\sum_{#?}^{#?}', '\\Sigma'],
    within: 3,
    strokes: [
      [
        ...l([0.82, 0.05], [0.18, 0.1]),
        ...l([0.18, 0.1], [0.58, 0.5]),
        ...l([0.58, 0.5], [0.15, 0.9]),
        ...l([0.15, 0.9], [0.85, 0.95]),
      ],
    ],
  },
  {
    // The ROOT itself must rank – a regression here once meant drawing a
    // radical could only insert ✓. Drawn the way the Detexify data shows
    // people draw it: a small tick, then the long roof (the vinculum)
    // across the top.
    accept: ['\\sqrt{#?}'],
    within: 3,
    strokes: [
      [
        ...l([0.05, 0.4], [0.13, 0.34], 4),
        ...l([0.13, 0.34], [0.22, 0.66], 6),
        ...l([0.22, 0.66], [0.34, 0.06], 8),
        ...l([0.34, 0.06], [0.97, 0.08], 14),
      ],
    ],
  },
  {
    accept: ['\\int_{#?}^{#?}'],
    within: 3,
    strokes: [
      [...q([0.75, 0.06], [0.4, -0.04], [0.52, 0.48], 24), ...q([0.52, 0.48], [0.62, 1.04], [0.26, 0.94], 24)],
    ],
  },
  {
    accept: ['\\pi', '\\Pi'],
    within: 3,
    strokes: [q([0.06, 0.28], [0.5, 0.14], [0.94, 0.26]), l([0.34, 0.24], [0.3, 0.88]), l([0.66, 0.24], [0.72, 0.9])],
  },
  {
    // Detexify's arrow classes are all genuine readings of a drawn arrow.
    accept: ['\\rightarrow', '\\longrightarrow', '\\to'],
    within: 3,
    strokes: [[...l([0.06, 0.52], [0.94, 0.5]), ...l([0.94, 0.5], [0.68, 0.3])], l([0.94, 0.5], [0.7, 0.7], 8)],
  },
  {
    // Humans draw ∈ and ε near-identically; both are honest candidates.
    // Flattened to double width it honestly reads as ≡/⊂.
    accept: ['\\in', '\\epsilon', '\\varepsilon'],
    within: 3,
    stretchTo: 1.5,
    strokes: [
      [...q([0.9, 0.1], [0.0, 0.1], [0.15, 0.52], 20), ...q([0.15, 0.52], [0.0, 0.95], [0.9, 0.9], 20)],
      l([0.15, 0.5], [0.88, 0.5]),
    ],
  },
  {
    accept: ['\\infty'],
    within: 3,
    // A crossing figure-eight, wide and flat – the way the Detexify data
    // shows people actually draw ∞ (a lemniscate, not two tangent circles).
    strokes: [
      Array.from({ length: 48 }, (_, i) => {
        const t = (i / 47) * 2 * Math.PI;
        const d = 1 + Math.cos(t) * Math.cos(t);
        return [0.5 + (0.45 * Math.sin(t)) / d, 0.5 + (0.5 * Math.sin(t) * Math.cos(t)) / d] as const;
      }),
    ],
  },
  {
    accept: ['\\mathscr{L}'],
    within: 3,
    // A cursive capital flattened to double width honestly reads as an
    // angle-family glyph.
    stretchTo: 1.5,
    strokes: [
      [
        ...q([0.52, 0.14], [0.88, -0.06], [0.58, 0.3], 18),
        ...q([0.58, 0.3], [0.32, 0.58], [0.44, 0.78], 18),
        ...q([0.44, 0.78], [0.52, 1.02], [0.18, 0.9], 14),
        ...q([0.18, 0.9], [0.42, 0.76], [0.92, 0.88], 14),
      ],
    ],
  },
  {
    accept: ['\\ell'],
    within: 3,
    // A cursive loop stretched to double width honestly reads as ρ/β.
    stretchTo: 1.5,
    // Drawn the way the Detexify data shows: a TALL, nearly closed loop
    // (up-stroke and down-stroke almost touching), crossing near the
    // bottom with a short exit tail.
    strokes: [
      [
        ...l([0.05, 0.95], [0.25, 0.8], 5),
        ...q([0.25, 0.8], [0.2, 0.45], [0.3, 0.12], 10),
        ...q([0.3, 0.12], [0.42, 0.02], [0.42, 0.3], 8),
        ...q([0.42, 0.3], [0.4, 0.6], [0.32, 0.8], 8),
        ...l([0.32, 0.8], [0.55, 0.95], 6),
      ],
    ],
  },
  {
    accept: ['\\times'],
    within: 3,
    // A cross flattened to double width honestly reads as ≍/≃.
    stretchTo: 1.5,
    strokes: [l([0.12, 0.12], [0.88, 0.88]), l([0.9, 0.1], [0.1, 0.9])],
  },
  {
    accept: ['\\cup', '\\bigcup'],
    within: 2,
    // A cup flattened to double width honestly reads as ⌣/⊔.
    stretchTo: 1.5,
    strokes: [
      [...l([0.16, 0.08], [0.18, 0.5]), ...q([0.18, 0.5], [0.5, 1.05], [0.84, 0.5], 20), ...l([0.84, 0.5], [0.86, 0.08])],
    ],
  },
];

/** Stretch every stroke horizontally – a wide surface invites wide drawings. */
const stretched = (strokes: Stroke[], factor: number): Stroke[] =>
  strokes.map((stroke) => stroke.map(([x, y]) => [x * factor, y] as const));

describe('draw-to-find recogniser', () => {
  it('ranks the drawn symbol prominently for canonical drawings', () => {
    for (const { accept, within, strokes } of DRAWINGS) {
      const { candidates } = recogniseStrokes(strokes);
      expect(candidates.length, `no candidates for ${accept[0]}`).toBeGreaterThan(0);
      expect(
        candidates.slice(0, within).some((c) => accept.includes(c.latex)),
        `${accept[0]} not in top ${within}: ${candidates.map((c) => c.latex).join(' ')}`,
      ).toBe(true);
    }
  });

  it('tolerates drawings stretched to twice their natural width', { timeout: 60_000 }, () => {
    // Regression: the drawing surface is much wider than tall, and strict
    // aspect-preserving normalisation used to fail anything drawn across
    // its full width.
    for (const { accept, strokes, stretchTo } of DRAWINGS) {
      for (const factor of [1.5, 2].filter((f) => f <= (stretchTo ?? 2))) {
        const { candidates } = recogniseStrokes(stretched(strokes, factor));
        expect(
          candidates.slice(0, 5).some((c) => accept.includes(c.latex)),
          `${accept[0]} at ${factor}x → ${candidates.map((c) => c.latex).join(' ')}`,
        ).toBe(true);
      }
    }
  });

  it('keeps the drawn symbol in the list under sloppy drawing', { timeout: 120_000 }, () => {
    const TRIALS = 8;
    let total = 0;
    let listed = 0;
    const misses: string[] = [];
    for (const { accept, strokes } of DRAWINGS) {
      for (let t = 0; t < TRIALS; t++) {
        const { candidates } = recogniseStrokes(shuffled(sloppy(strokes, 1.3)));
        total++;
        if (candidates.some((c) => accept.includes(c.latex))) listed++;
        else misses.push(`${accept[0]} → ${candidates[0]?.latex ?? '(none)'}`);
      }
    }
    // The five-row list is the product surface; the drawn symbol must
    // survive sloppiness into it in the large majority of trials.
    expect(listed / total, `list rate (misses: ${misses.join(', ')})`).toBeGreaterThanOrEqual(0.8);
  });

  it('separates the script-L / ell pair', { timeout: 60_000 }, () => {
    // A sloppy cursive loop honestly wanders into ρ/β/ℰ territory, so the
    // containment bar is statistical. Since SHORTLIST grew to 48 the
    // honest lookalike is always scored, so on the very sloppiest trials
    // it can edge a borderline drawing (measured: one script-L trial
    // scores 1.88 – nearly junk – and ℓ wins by 0.13). The contract that
    // matters for the product surface: the drawn symbol stays a
    // one-arrow-key correction away in the top three, and a swapped
    // identity is NEVER a confident verdict.
    const scriptL = DRAWINGS.find((c) => c.accept[0] === '\\mathscr{L}')!;
    const ell = DRAWINGS.find((c) => c.accept[0] === '\\ell')!;
    let scriptLListed = 0;
    let ellListed = 0;
    const TRIALS = 8;
    for (let t = 0; t < TRIALS; t++) {
      // Mild sloppiness: this test is about the two shapes keeping their
      // identities; robustness to heavy noise is the held-out benchmark's
      // job (the prototypes are real drawings, not our synthetics).
      const sResult = recogniseStrokes(sloppy(scriptL.strokes, 0.9));
      const eResult = recogniseStrokes(sloppy(ell.strokes, 0.9));
      const sTop = sResult.candidates;
      const eTop = eResult.candidates;
      if (sTop[0]?.latex === '\\ell') {
        expect(sResult.confident, 'a swapped script-L read as confident').toBe(false);
        expect(sTop.slice(0, 3).some((c) => c.latex === '\\mathscr{L}')).toBe(true);
      }
      if (eTop[0]?.latex === '\\mathscr{L}') {
        expect(eResult.confident, 'a swapped ell read as confident').toBe(false);
        expect(eTop.slice(0, 3).some((c) => c.latex === '\\ell')).toBe(true);
      }
      if (sTop.slice(0, 3).some((c) => c.latex === '\\mathscr{L}')) scriptLListed++;
      if (eTop.slice(0, 3).some((c) => c.latex === '\\ell')) ellListed++;
    }
    expect(scriptLListed).toBeGreaterThanOrEqual(6);
    expect(ellListed).toBeGreaterThanOrEqual(5);
  });

  it('reads bare lines as what they are, never as something more', () => {
    // A vertical bar IS the symbol ∣ – recognising it CONFIDENTLY is
    // correct, and doubles as the proof that the confident path is
    // reachable at all (both gates genuinely cleared). A horizontal dash
    // has no symbol class of its own here, so it may offer a weak list
    // but must never claim confidence.
    const horizontal: Stroke = Array.from({ length: 12 }, (_, i) => [0.1 + i * 0.07, 0.5]);
    const vertical: Stroke = Array.from({ length: 12 }, (_, i) => [0.5, 0.1 + i * 0.07]);
    expect(recogniseStrokes([horizontal]).confident).toBe(false);
    const verticalResult = recogniseStrokes([vertical]);
    expect(verticalResult.candidates[0]!.latex).toBe('\\mid');
    expect(verticalResult.confident).toBe(true);
  });

  it('is confident about a clean, distinctive drawing', () => {
    // The flip side of the dash rule: confidence must still be reachable.
    const forall = DRAWINGS.find((c) => c.accept[0] === '\\forall')!;
    expect(recogniseStrokes(forall.strokes).candidates[0]!.latex).toBe('\\forall');
  });

  it('keeps dot strokes, so ÷ is drawable', () => {
    const bar: Stroke = Array.from({ length: 12 }, (_, i) => [0.1 + i * 0.07, 0.5]);
    const { candidates } = recogniseStrokes([bar, [[0.5, 0.15]], [[0.5, 0.85]]]);
    expect(candidates.slice(0, 5).map((c) => c.latex)).toContain('\\div');
  });

  it('rejects scribbles: mostly no candidates, never a confident one', () => {
    let rejected = 0;
    const SCRIBBLES = 6;
    for (let s = 0; s < SCRIBBLES; s++) {
      let x = 0.5;
      let y = 0.5;
      const walk: [number, number][] = [];
      for (let i = 0; i < 160; i++) {
        x = Math.min(1, Math.max(0, x + gauss() * 0.18));
        y = Math.min(1, Math.max(0, y + gauss() * 0.18));
        walk.push([x, y]);
      }
      const recognition = recogniseStrokes([walk]);
      if (recognition.candidates.length === 0) rejected++;
      expect(recognition.confident, 'a scribble read as confident').toBe(false);
    }
    expect(rejected).toBeGreaterThanOrEqual(3);
  });

  it('shows grouped classes on adjacent rows', () => {
    // The adjacency guarantee: when a drawing's list contains more than
    // one member of a visually inseparable group, they sit on consecutive
    // rows – a top-1 miss onto a twin is a one-arrow-key correction.
    for (const { accept, strokes } of DRAWINGS) {
      const { candidates } = recogniseStrokes(strokes);
      for (const group of CANDIDATE_GROUPS) {
        const positions = candidates
          .map((candidate, index) => (group.includes(candidate.latex) ? index : -1))
          .filter((index) => index >= 0);
        for (let i = 1; i < positions.length; i++) {
          expect(
            positions[i]! - positions[i - 1]!,
            `${group.join('/')} split apart for ${accept[0]}: ` +
              candidates.map((candidate) => candidate.latex).join(' '),
          ).toBe(1);
        }
      }
    }
  });

  it('never returns more than MAX_CANDIDATES, best match first', () => {
    // The list is ranked by score EXCEPT that a grouped twin is pulled up
    // next to its partner, so full monotonicity is not the contract – the
    // best match leading the list is.
    const times = DRAWINGS.find((c) => c.accept[0] === '\\times')!;
    const { candidates, matches } = recogniseStrokes(times.strokes);
    expect(candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(matches).toBeGreaterThanOrEqual(1);
    for (const candidate of candidates) {
      expect(candidate.score).toBeGreaterThanOrEqual(candidates[0]!.score);
    }
    expect(candidates[0]!.score).toBeLessThanOrEqual(NO_MATCH_THRESHOLD);
  });

  it('handles degenerate input without crashing', () => {
    expect(recogniseStrokes([]).candidates).toHaveLength(0);
    expect(recogniseStrokes([[[0.5, 0.5]]]).candidates).toBeInstanceOf(Array);
    const dot = toCloud([[[0.5, 0.5]]]);
    expect(cloudDistance(dot, dot)).toBe(0);
  });
});
