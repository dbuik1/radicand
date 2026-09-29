/**
 * Expression library model and persistence: user-saved named expressions,
 * re-insertable from My library, the symbol search and (optionally)
 * `\`-triggers. This module owns the *data* – the views live elsewhere –
 * on the shared entry store (entry-store.ts), which handles persistence,
 * read-only protection, import/export and the starter pack; this file adds
 * what a library entry is and how two entries count as the same.
 */
import { coerce, createEntryStore } from './entry-store';
import type { ImportStrategy, StoredEntry } from './entry-store';

export type { ImportStrategy };

export interface LibraryEntry extends StoredEntry {
  /** User-facing name; duplicates are warned about, never blocked. */
  name: string;
  /** LaTeX fragment; empty slots stored as `\placeholder{}`. */
  body: string;
  /** Optional `\`-trigger, letters only, stored without the backslash. */
  trigger?: string;
  /** '; '-separated synonyms for the search. */
  keywords?: string;
  /** Free text; no filter UI in v1. */
  category?: string;
}

export interface NewLibraryEntry {
  name: string;
  body: string;
  trigger?: string;
  keywords?: string;
  category?: string;
  seeded?: boolean;
}

/** Only an entry with no body at all is dropped (nothing to insert). */
function normaliseEntry(raw: unknown, makeId: () => string): LibraryEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Partial<LibraryEntry>;
  if (typeof r.body !== 'string' || r.body.trim() === '') return null;
  const trigger = coerce.optionalText(r.trigger);
  const keywords = coerce.optionalText(r.keywords);
  const category = coerce.optionalText(r.category);
  return {
    ...coerce.base(r, makeId),
    name: typeof r.name === 'string' ? r.name : '',
    body: r.body,
    ...(trigger !== undefined ? { trigger } : {}),
    ...(keywords !== undefined ? { keywords } : {}),
    ...(category !== undefined ? { category } : {}),
  };
}

const store = createEntryStore<LibraryEntry>({
  storageKey: 'library',
  noun: 'library',
  normalise: normaliseEntry,
  /** Duplicate identity beyond ids: same name (case-folded) and body. */
  contentKey: (entry) => `${entry.name.trim().toLowerCase()}\0${entry.body}`,
  /** An imported duplicate is kept under an " (imported)" name suffix. */
  keepBoth: (entry) => ({ ...entry, name: `${entry.name} (imported)` }),
  triggerOf: (entry) => entry.trigger,
  withoutTrigger: (entry) => {
    const copy = { ...entry };
    delete copy.trigger;
    return copy;
  },
});

/** Load the library once at startup. Subsequent reads are synchronous. */
export const loadLibrary = store.load;
export const getLibraryEntries = store.get;
/** True when a newer schema version owns the stored record. */
export const isLibraryReadOnly = store.isReadOnly;
/** Add an entry; returns it with its generated identity and timestamps. */
export const addLibraryEntry: (fields: NewLibraryEntry) => LibraryEntry = store.add;
export const updateLibraryEntry: (id: string, patch: Partial<NewLibraryEntry>) => LibraryEntry | null =
  store.update;
/** My library's undo: a deleted entry goes back exactly as it was. */
export const restoreLibraryEntry = store.restore;
export const deleteLibraryEntry = store.delete;
export const recordLibraryUse = store.recordUse;
export const onLibraryChange = store.onChange;
export const exportLibrary = store.exportJson;
export const parseLibraryFile = store.parseFile;
export const importLibraryEntries = store.importEntries;
export const addSeededEntries: (pack: readonly NewLibraryEntry[]) => number = store.addSeeded;
export const removeSeededEntries = store.removeSeeded;
export const hasSeededEntries = store.hasSeeded;
/** The library entry a fully typed `\trigger` confirms to, if any. */
export const findLibraryTrigger = store.findTrigger;
export const isLibraryTriggerPrefix = store.isTriggerPrefix;
