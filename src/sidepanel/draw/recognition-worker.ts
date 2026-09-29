/**
 * Module-worker entry for draw-to-find recognition: the prototype data,
 * cloud compilation and the ~100–200 ms ranking all live here, off the
 * main thread, so the drawing surface and the panel stay responsive while
 * a stroke is being matched. The panel talks to it through
 * recognition-client.ts; the protocol (and its unit-tested handler) is
 * recognition-protocol.ts.
 */
import { READY, handleRequest } from './recognition-protocol';
import type { RecognitionRequest } from './recognition-protocol';

// The DOM lib types `self` as Window; in a dedicated worker it is the
// worker scope, whose postMessage takes just the message.
const scope = self as { postMessage(message: unknown): void };

self.addEventListener('message', (event) => {
  const response = handleRequest((event as MessageEvent<RecognitionRequest>).data);
  if (response !== null) scope.postMessage(response);
});

scope.postMessage(READY);
