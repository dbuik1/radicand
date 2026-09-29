/**
 * Shared helpers over MathLive's offset model. Offsets are a post-order
 * traversal of the equation's atoms: an atom's children occupy the run of
 * deeper offsets immediately before the atom's own offset.
 */
import type { MathfieldElement } from 'mathlive';

/** Depth of the atom ending at `offset` (0 = top level); 0 when unknown. */
export function depthAtOffset(mf: MathfieldElement, offset: number): number {
  const info = mf.getElementInfo(offset);
  return info && typeof info.depth === 'number' ? info.depth : 0;
}
