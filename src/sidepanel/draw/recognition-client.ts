/**
 * The panel's handle on the recognition worker: a tiny promise-per-request
 * wrapper over postMessage. Requests carry an id so a response always
 * finds its caller; ordering and staleness are the caller's concern
 * (draw-find.ts already orphans superseded recognitions by generation).
 *
 * A worker that fails – construction aside (the caller catches that) –
 * rejects every outstanding and future request, which draw-find.ts turns
 * into the "Drawing recognition is unavailable" state.
 */
import type { DrawRecognition } from './templates';
import type { Stroke } from './recogniser';
import type { RecognitionRequest, RecognitionResponse } from './recognition-protocol';

export interface DrawRecogniser {
  /** Rank a drawing's strokes in the worker. */
  recognise(strokes: readonly Stroke[]): Promise<DrawRecognition>;
  /** Ask the worker to precompile the prototype clouds (idempotent). */
  warmUp(): void;
  /**
   * The dataset attribution notice, once the worker reports ready. Never
   * rejects – on worker failure it simply stays pending (recognise() is
   * where failure surfaces).
   */
  notice: Promise<string>;
}

interface Pending {
  resolve: (recognition: DrawRecognition) => void;
  reject: (error: Error) => void;
}

let shared: Promise<DrawRecogniser | null> | null = null;

/**
 * The one worker, shared by every caller that needs drawing recognition:
 * starting it twice would compile the prototype set twice. Resolves null
 * (callers show their unavailable state) if the worker cannot start.
 */
export function loadWorkerRecogniser(): Promise<DrawRecogniser | null> {
  shared ??= Promise.resolve().then(() => {
    try {
      return createWorkerRecogniser();
    } catch (error) {
      console.error('Recognition is unavailable:', error);
      return null;
    }
  });
  return shared;
}

/** Spin up the worker-backed recogniser. Throws if Worker cannot start. */
function createWorkerRecogniser(): DrawRecogniser {
  const worker = new Worker(new URL('./recognition-worker.ts', import.meta.url), {
    type: 'module',
  });
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let failure: Error | null = null;
  let announceReady: (notice: string) => void = () => {};
  const notice = new Promise<string>((resolve) => {
    announceReady = resolve;
  });

  worker.addEventListener('message', (event) => {
    const response = (event as MessageEvent<RecognitionResponse>).data;
    if (response.type === 'ready') {
      announceReady(response.notice);
      return;
    }
    pending.get(response.id)?.resolve(response.recognition);
    pending.delete(response.id);
  });

  worker.addEventListener('error', (event) => {
    failure = new Error((event as ErrorEvent).message || 'recognition worker failed');
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  });

  const post = (request: RecognitionRequest): void => worker.postMessage(request);

  const request = (build: (id: number) => RecognitionRequest): Promise<DrawRecognition> => {
    if (failure) return Promise.reject(failure);
    const id = nextId++;
    return new Promise<DrawRecognition>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      post(build(id));
    });
  };

  return {
    recognise(strokes) {
      // Strokes are plain nested number arrays – structured clone, no copy
      // needed here; the worker replies with the same id.
      return request((id) => ({ type: 'recognise', id, strokes: strokes as Stroke[] }));
    },
    warmUp() {
      if (!failure) post({ type: 'warm-up' });
    },
    notice,
  };
}
