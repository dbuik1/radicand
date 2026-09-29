/**
 * The message protocol between the panel and the recognition worker, plus
 * the request handler the worker runs. The handler lives here – separate
 * from the worker entry – so a unit test can assert the worker path is
 * rank-identical to calling the recogniser directly, without needing a
 * real Worker (vitest has none).
 */
import { recogniseStrokes, warmUp, DATA_NOTICE } from './templates';
import type { DrawRecognition } from './templates';
import type { Stroke } from './recogniser';

export type RecognitionRequest =
  | { type: 'warm-up' }
  | { type: 'recognise'; id: number; strokes: Stroke[] };

export type RecognitionResponse =
  | { type: 'ready'; notice: string }
  | { type: 'result'; id: number; recognition: DrawRecognition };

/**
 * Posted once when the worker boots: proof of life for the panel, and the
 * dataset's ODbL attribution notice, which the panel attaches to the DOM
 * (the prototype data itself never loads on the main thread).
 */
export const READY: RecognitionResponse = { type: 'ready', notice: DATA_NOTICE };

/** Handle one request; null means the request has no response message. */
export function handleRequest(request: RecognitionRequest): RecognitionResponse | null {
  if (request.type === 'warm-up') {
    warmUp();
    return null;
  }
  return { type: 'result', id: request.id, recognition: recogniseStrokes(request.strokes) };
}
