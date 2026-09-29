import { describe, it, expect } from 'vitest';
import { READY, handleRequest } from './recognition-protocol';
import { recogniseStrokes, DATA_NOTICE } from './templates';
import type { Stroke } from './recogniser';

/**
 * The worker must be rank-identical to calling the recogniser directly –
 * the offload is a concurrency change, never a behaviour change. The
 * handler is asserted against a direct call on real drawings.
 */
const line = (a: readonly [number, number], b: readonly [number, number]): Stroke =>
  Array.from({ length: 10 }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / 9,
    a[1] + ((b[1] - a[1]) * i) / 9,
  ]);

const FOR_ALL: Stroke[] = [
  [...line([0.2, 0.0], [0.52, 0.98]), ...line([0.52, 0.98], [0.8, 0.0])],
  line([0.28, 0.48], [0.72, 0.46]),
];

describe('recognition worker protocol', () => {
  it('announces the dataset attribution notice on boot', () => {
    expect(READY).toEqual({ type: 'ready', notice: DATA_NOTICE });
    expect(DATA_NOTICE.length).toBeGreaterThan(0);
  });

  it('answers a recognise request rank-identically to a direct call', () => {
    const response = handleRequest({ type: 'recognise', id: 7, strokes: FOR_ALL });
    expect(response).toEqual({
      type: 'result',
      id: 7,
      recognition: recogniseStrokes(FOR_ALL),
    });
  });

  it('warms up silently', () => {
    expect(handleRequest({ type: 'warm-up' })).toBeNull();
  });
});
