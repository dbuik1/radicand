/**
 * Custom shortcuts model and persistence: the user's own `\`-triggers, each
 * mapping a letters-only trigger to a LaTeX fragment, confirmed in the
 * field with space, Tab or Enter exactly like a library trigger. Unlike a
 * library entry a shortcut *is* its trigger – it has no name to be found
 * by, only an optional label – so the store keys duplicates on the trigger.
 * Persistence, read-only protection, import/export and the common set come
 * from the shared entry store (entry-store.ts).
 */
import { coerce, createEntryStore } from './entry-store';
import type { StoredEntry } from './entry-store';

export interface Shortcut extends StoredEntry {
  /** Two or more letters, stored without the backslash; case-sensitive. */
  trigger: string;
  /** The LaTeX inserted; empty slots stored as `\placeholder{}`. */
  latex: string;
  /** Optional label, announced on insertion instead of the trigger. */
  name?: string;
  /** '; '-separated synonyms for the search. */
  keywords?: string;
}

export interface NewShortcut {
  trigger: string;
  latex: string;
  name?: string;
  keywords?: string;
  seeded?: boolean;
}

/** What a trigger may look like: two or more letters, as a command name. */
export const TRIGGER_PATTERN = /^[a-zA-Z]{2,}$/;

/** An entry without a usable trigger or any LaTeX is dropped. */
function normaliseShortcut(raw: unknown, makeId: () => string): Shortcut | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Partial<Shortcut>;
  if (typeof r.trigger !== 'string' || !TRIGGER_PATTERN.test(r.trigger)) return null;
  if (typeof r.latex !== 'string' || r.latex.trim() === '') return null;
  const name = coerce.optionalText(r.name);
  const keywords = coerce.optionalText(r.keywords);
  return {
    ...coerce.base(r, makeId),
    trigger: r.trigger,
    latex: r.latex,
    ...(name !== undefined ? { name } : {}),
    ...(keywords !== undefined ? { keywords } : {}),
  };
}

function* suffixes(): Generator<string> {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  yield* letters.slice(1);
  for (let tails = ['']; ; ) {
    tails = tails.flatMap((tail) => [...letters].map((letter) => tail + letter));
    for (const tail of tails) for (const letter of letters) yield tail + letter;
  }
}

/**
 * The first `trigger` + letters that `taken` does not claim: `eps` gives
 * `epsb` … `epsz`, then `epsaa`, `epsab` and so on, so it always ends.
 */
export function freeTrigger(trigger: string, taken: (trigger: string) => boolean): string {
  for (const suffix of suffixes()) {
    if (!taken(trigger + suffix)) return trigger + suffix;
  }
  throw new Error('unreachable');
}

const store = createEntryStore<Shortcut>({
  storageKey: 'shortcuts',
  noun: 'shortcut list',
  normalise: normaliseShortcut,
  contentKey: (entry) => entry.trigger,
  // Two shortcuts cannot share a trigger, so an imported duplicate gets the
  // first free letter suffix (`eps` → `epsb`); the list shows the result.
  keepBoth: (entry, taken) => ({
    ...entry,
    trigger: freeTrigger(entry.trigger, (trigger) => taken({ ...entry, trigger })),
  }),
  triggerOf: (entry) => entry.trigger,
});

/** Load the shortcuts once at startup. Subsequent reads are synchronous. */
export const loadShortcuts = store.load;
export const getShortcuts = store.get;
/** True when a newer schema version owns the stored record. */
export const areShortcutsReadOnly = store.isReadOnly;
export const addShortcut: (fields: NewShortcut) => Shortcut = store.add;
export const updateShortcut: (id: string, patch: Partial<NewShortcut>) => Shortcut | null =
  store.update;
/** The list's undo: a deleted shortcut goes back exactly as it was. */
export const restoreShortcut = store.restore;
export const deleteShortcut = store.delete;
export const recordShortcutUse = store.recordUse;
export const onShortcutsChange = store.onChange;
export const exportShortcuts = store.exportJson;
export const parseShortcutsFile = store.parseFile;
export const importShortcuts = store.importEntries;
export const addSeededShortcuts: (pack: readonly NewShortcut[]) => number = store.addSeeded;
export const removeSeededShortcuts = store.removeSeeded;
export const hasSeededShortcuts = store.hasSeeded;
/** The shortcut a fully typed `\trigger` confirms to, if any. */
export const findShortcut = store.findTrigger;
export const isShortcutPrefix = store.isTriggerPrefix;

/** What a shortcut is announced as once inserted. */
export function shortcutLabel(shortcut: Shortcut): string {
  return shortcut.name ?? `\\${shortcut.trigger}`;
}
