/**
 * $P point-cloud gesture recogniser (Vatavu, Anthony & Wobbrock, ICMI 2012),
 * dependency-free. Multi-stroke, and invariant to stroke order, stroke
 * direction, position and scale – but deliberately NOT to rotation: maths
 * symbols are orientation-sensitive (a ∑ is not an M, ∪ is not ∩).
 *
 * Drawings and templates are both reduced to a normalised cloud of N points;
 * matching is a greedy minimum-distance alignment tried from several start
 * points in both directions. Scores are relative distances – lower is a
 * better match, zero is identical.
 */

/** One [x, y] sample of a stroke, in any consistent coordinate space. */
export type DrawPoint = readonly [number, number];
/** One stroke: the pointer samples between pointer-down and pointer-up. */
export type Stroke = readonly DrawPoint[];

/** A normalised cloud point: position plus the stroke it came from. */
interface CloudPoint {
  x: number;
  y: number;
  stroke: number;
}

export type Cloud = CloudPoint[];

/** Points per normalised cloud (the default; a coarse prefilter uses fewer). */
const CLOUD_SIZE = 48;

const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

function pathLength(strokes: readonly Stroke[]): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const [px, py] = stroke[i - 1]!;
      const [cx, cy] = stroke[i]!;
      total += distance(px, py, cx, cy);
    }
  }
  return total;
}

/**
 * Resample the strokes to CLOUD_SIZE points spread evenly by arc length.
 * Only the very first point of the whole drawing is seeded outright (a
 * per-stroke seed would push the interval-spaced samples over budget and
 * clip the LAST stroke – often the discriminating one, like ∀'s crossbar).
 * Single-point strokes are dots: each carries DOT_SAMPLES coincident
 * samples – a dot is a deliberate mark, and at one sample it would be too
 * cheap for a matcher to ignore (a bare dash would pass for a ÷). The
 * line-work shares the remaining budget.
 */
const DOT_SAMPLES = 4;

function resample(strokes: readonly Stroke[], size: number): Cloud {
  const dots: CloudPoint[] = [];
  strokes.forEach((stroke, id) => {
    if (stroke.length === 1) {
      for (let s = 0; s < DOT_SAMPLES; s++) {
        dots.push({ x: stroke[0]![0], y: stroke[0]![1], stroke: id });
      }
    }
  });
  const length = pathLength(strokes);
  const out: Cloud = [];
  if (length === 0) {
    // Dots only (or an empty drawing): pad with the first point.
    const [x = 0, y = 0] = strokes[0]?.[0] ?? [];
    out.push(...dots);
    while (out.length < size) out.push({ x, y, stroke: 0 });
    return out.slice(0, size);
  }
  const budget = size - Math.min(dots.length, size - 2);
  const interval = length / (budget - 1);
  let accumulated = 0;
  strokes.forEach((stroke, id) => {
    if (stroke.length < 2) return; // dots were collected above
    let [px, py] = stroke[0]!;
    if (out.length === 0) out.push({ x: px, y: py, stroke: id });
    for (let i = 1; i < stroke.length; i++) {
      const [cx, cy] = stroke[i]!;
      let segment = distance(px, py, cx, cy);
      while (accumulated + segment >= interval && segment > 0) {
        const t = (interval - accumulated) / segment;
        px += t * (cx - px);
        py += t * (cy - py);
        out.push({ x: px, y: py, stroke: id });
        segment = distance(px, py, cx, cy);
        accumulated = 0;
      }
      accumulated += segment;
      [px, py] = [cx, cy];
    }
  });
  out.push(...dots);
  while (out.length < size) out.push({ ...out[out.length - 1]! });
  return out.slice(0, size);
}

/**
 * How a cloud is scaled to the unit square. 'preserve' keeps the aspect
 * ratio (robust to noise, intolerant of stretch); 'stretch' maps each axis
 * independently (stretch-invariant – the wide drawing surface invites wide
 * drawings – but it amplifies noise on the narrow axis of tall or flat
 * shapes). The ranker scores BOTH and keeps the better, so each drawing is
 * judged by whichever reading suits it.
 */
export type NormaliseMode = 'preserve' | 'stretch';

/**
 * Ratio of a shape's extent that still counts as two-dimensional: below it,
 * stretching the short axis to the unit square would be pure noise (a bare
 * line has no second dimension to stretch).
 */
const FLAT_RATIO = 0.15;

/** Scale to the unit square per `mode`, centred on the centroid. */
function normalise(cloud: Cloud, mode: NormaliseMode): Cloud {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of cloud) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const largest = Math.max(w, h) || 1;
  const stretch = mode === 'stretch';
  const sx = stretch && w > FLAT_RATIO * h ? w : largest;
  const sy = stretch && h > FLAT_RATIO * w ? h : largest;
  const scaled = cloud.map((p) => ({
    x: (p.x - minX) / sx,
    y: (p.y - minY) / sy,
    stroke: p.stroke,
  }));
  let cx = 0;
  let cy = 0;
  for (const p of scaled) {
    cx += p.x;
    cy += p.y;
  }
  cx /= scaled.length;
  cy /= scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, stroke: p.stroke }));
}

/**
 * Height/width ratio of the drawing's bounding box, clamped away from the
 * degenerate extremes. The ranker compares it against each template's to
 * keep aspect a soft, not hard, signal.
 */
export function boundingAspect(strokes: readonly Stroke[]): number {
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
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  return Math.min(20, Math.max(0.05, h / w));
}

/** Reduce a drawing (or a template's strokes) to a matchable cloud. */
export function toCloud(
  strokes: readonly Stroke[],
  mode: NormaliseMode = 'preserve',
  size: number = CLOUD_SIZE,
): Cloud {
  return normalise(resample(strokes, size), mode);
}

/** One greedy alignment pass, abandoned early once it exceeds `bound`. */
function greedyMatch(from: Cloud, to: Cloud, start: number, bound: number): number {
  const n = from.length;
  const matched = new Array<boolean>(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let min = Infinity;
    let index = -1;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const d = distance(from[i]!.x, from[i]!.y, to[j]!.x, to[j]!.y);
      if (d < min) {
        min = d;
        index = j;
      }
    }
    if (index === -1) return Infinity; // NaN coordinates – nothing matches
    matched[index] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * min;
    if (sum >= bound) return Infinity; // cannot beat the best pass any more
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

/**
 * Distance between two clouds: the best greedy alignment either way round.
 * `bound` lets a caller ranking many templates abandon a comparison that
 * can no longer affect the result (the return value is then only known to
 * be at least `bound`).
 */
export function cloudDistance(a: Cloud, b: Cloud, bound = Infinity): number {
  const n = a.length;
  const step = Math.floor(Math.sqrt(n));
  let best = bound;
  for (let start = 0; start < n; start += step) {
    best = Math.min(best, greedyMatch(a, b, start, best), greedyMatch(b, a, start, best));
  }
  return best;
}
