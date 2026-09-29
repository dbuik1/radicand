/**
 * The bundled symbol index (src/assets/symbol-index.json), loaded once for
 * every consumer: the Symbols search and the `\` finder read the same
 * entries, so a change to the file's shape is met in one place.
 *
 * The file is generated offline by scripts/generate-symbol-index.mjs and
 * loaded lazily on first use, so the panel's first paint never pays for it.
 * A file from a different version is refused once, with one console error;
 * consumers get null and degrade on their own terms.
 */
import type { ListEntry } from './symbol-list';

interface SymbolIndex {
  version: number;
  entries: ListEntry[];
}

/** The index shape this build reads. */
const INDEX_VERSION = 1;

let indexPromise: Promise<ListEntry[] | null> | null = null;

/**
 * Load the index on first call; every later call returns the same promise.
 * Resolves to null if the file fails to load or carries another version.
 */
export function loadSymbolIndex(): Promise<ListEntry[] | null> {
  indexPromise ??= (async () => {
    try {
      const module = await import('../assets/symbol-index.json');
      const data = module.default as unknown as SymbolIndex;
      if (data.version !== INDEX_VERSION) {
        console.error(`Symbol index version ${data.version} is not supported.`);
        return null;
      }
      return data.entries;
    } catch (error) {
      console.error('The symbol index is unavailable:', error);
      return null;
    }
  })();
  return indexPromise;
}
