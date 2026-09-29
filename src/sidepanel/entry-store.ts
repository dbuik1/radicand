/**
 * The persisted-entry store behind My library and Custom shortcuts: one
 * record under one `chrome.storage.local` key, the in-memory array as the
 * read source, synchronous listener notification, debounced writes with a
 * pagehide flush, and `chrome.storage.onChanged` propagation so a second
 * panel instance (detached window/tab) follows. Each store supplies what
 * differs – the key, how a raw entry is coerced, what counts as a duplicate
 * on import – and gets the persistence, read-only guard, CRUD, usage
 * counting, import/export and starter-set handling once.
 *
 * Storage is `chrome.storage.local`, deliberately not sync: sync's
 * 102,400-byte quota would cap a library at roughly 400 entries. Backup
 * and portability come from JSON export/import instead. A small in-memory
 * fallback covers contexts without `chrome.storage` (unit tests, plain
 * `vite preview`), matching settings.ts.
 */
import { hasChromeStorage } from '../settings-storage';

/** The fields every stored entry carries; stores add their own. */
export interface StoredEntry {
  /** Stable across edits; `crypto.randomUUID()` at creation. */
  id: string;
  created: number;
  modified: number;
  /** Insert count – the default sort is most recently used. */
  uses: number;
  lastUsed?: number;
  /** True while a starter-set entry remains unmodified. */
  seeded?: boolean;
}

export interface StoredRecord<E> {
  version: 1;
  entries: E[];
}

/** The record schema version this build reads and writes. */
const RECORD_VERSION = 1;

/**
 * What a change notification carries: `content` when entries were added,
 * edited, removed or reordered by an import; `usage` when only a use count
 * and timestamp moved, so a view that is not sorted by use has nothing to
 * redraw.
 */
export type EntryChangeKind = 'content' | 'usage';
export type EntryListener<E> = (entries: readonly E[], kind: EntryChangeKind) => void;

export type ImportStrategy = 'skip' | 'keep-both' | 'replace';

export interface ImportResult {
  added: number;
  skipped: number;
  removed: number;
  /** Entries imported without their trigger, because it was taken. */
  untriggered: number;
}

/** The exported file: the stored record plus provenance fields. */
export interface EntryExport<E> extends StoredRecord<E> {
  exported: number;
  extension: string;
}

/** Helpers a store's `normalise` can lean on for the common fields. */
export const coerce = {
  optionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
  },
  time(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  },
  /** The fields of StoredEntry, tolerantly, from a raw object. */
  base(r: Partial<StoredEntry>, makeId: () => string): StoredEntry {
    const now = Date.now();
    const lastUsed =
      typeof r.lastUsed === 'number' && Number.isFinite(r.lastUsed) ? r.lastUsed : undefined;
    return {
      id: typeof r.id === 'string' && r.id !== '' ? r.id : makeId(),
      created: coerce.time(r.created, now),
      modified: coerce.time(r.modified, now),
      uses: typeof r.uses === 'number' && Number.isFinite(r.uses) && r.uses > 0 ? r.uses : 0,
      ...(lastUsed !== undefined ? { lastUsed } : {}),
      ...(r.seeded === true ? { seeded: true } : {}),
    };
  },
};

export interface EntryStoreConfig<E extends StoredEntry> {
  /** The `chrome.storage.local` key holding the record. */
  storageKey: string;
  /** Named in error messages after "the": "the library". */
  noun: string;
  /**
   * Coerce one raw stored value, tolerantly: unusable fields fall back and
   * only an entry with nothing to insert returns null. The record is never
   * reset wholesale – a malformed neighbour costs nothing but itself.
   */
  normalise: (raw: unknown, makeId: () => string) => E | null;
  /** Duplicate identity beyond ids, for import and the starter set. */
  contentKey: (entry: E) => string;
  /** How an imported duplicate is kept alongside the original. */
  keepBoth: (entry: E, taken: (candidate: E) => boolean) => E;
  /** The `\`-trigger an entry answers to, if any. */
  triggerOf: (entry: E) => string | undefined;
  /**
   * The entry without its trigger, for a store whose triggers are
   * optional: an imported entry whose trigger is taken keeps everything
   * else. Without it, a taken trigger is left to `keepBoth` to rename.
   */
  withoutTrigger?: (entry: E) => E;
}

export interface EntryStore<E extends StoredEntry> {
  /** Load once at startup; subsequent reads are synchronous. */
  load(): Promise<readonly E[]>;
  /** Synchronous access to the loaded entries (the in-memory read source). */
  get(): readonly E[];
  /** True when a newer schema version owns the stored record. */
  isReadOnly(): boolean;
  /** Add an entry from its user-supplied fields; throws when unusable. */
  add(fields: object): E;
  /**
   * Patch an entry by id; bumps `modified` and clears `seeded` (an edited
   * starter entry is the user's own from then on). Null when the id is
   * unknown or the patch would leave nothing to insert.
   */
  update(id: string, patch: object): E | null;
  /** Put a deleted entry back exactly as it was – a view's undo. */
  restore(entry: E): boolean;
  /** Delete by id; returns whether anything was removed. */
  delete(id: string): boolean;
  /** Count an insertion, for the most-recently-used default sort. */
  recordUse(id: string): void;
  /** Subscribe to changes. Returns an unsubscribe function. */
  onChange(listener: EntryListener<E>): () => void;
  /** Serialise for download – boringly readable on purpose. */
  exportJson(): string;
  /** Parse an exported (or hand-written) file; null when it is not one. */
  parseFile(text: string): E[] | null;
  /** Merge (or replace with) previously parsed entries. */
  /**
   * `unavailable` names content a renamed copy must also avoid, beyond the
   * entries already in the store: another store's triggers, for example.
   * With `withoutTrigger`, an entry whose trigger is taken – by the store,
   * by an earlier entry in the file, or by `unavailable` – comes in
   * without it, so one trigger never answers for two entries.
   */
  importEntries(
    imported: readonly E[],
    strategy: ImportStrategy,
    unavailable?: (candidate: E) => boolean,
  ): ImportResult;
  /** Add starter entries (skipping content duplicates), flagged seeded. */
  addSeeded(pack: readonly object[]): number;
  /** Remove still-seeded (never edited) entries; the user's own survive. */
  removeSeeded(): number;
  /** Whether any unedited starter entries remain. */
  hasSeeded(): boolean;
  /** The entry a fully typed `\trigger` confirms to, if any. */
  findTrigger(name: string): E | null;
  /** Whether any trigger starts with `prefix`. */
  isTriggerPrefix(prefix: string): boolean;
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createEntryStore<E extends StoredEntry>(config: EntryStoreConfig<E>): EntryStore<E> {
  const { storageKey, noun, normalise, contentKey, keepBoth, triggerOf, withoutTrigger } = config;
  // Listeners live for the panel's lifetime (the panel never unmounts).
  const listeners = new Set<EntryListener<E>>();
  let entries: E[] = [];
  /**
   * True when the stored record came from a NEWER schema version: the
   * entries are offered read-only (parsed tolerantly, best effort) and
   * every mutation is refused, so an older panel can never destroy a
   * newer format. The views say so to the user.
   */
  let readOnly = false;

  function normaliseRecord(raw: unknown): E[] {
    if (raw === null || typeof raw !== 'object') return [];
    const list = (raw as Partial<StoredRecord<E>>).entries;
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: E[] = [];
    for (const item of list) {
      const entry = normalise(item, makeId);
      if (entry === null || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
    return out;
  }

  function isNewerVersion(raw: unknown): boolean {
    const version = (raw as Partial<StoredRecord<E>> | undefined)?.version;
    return typeof version === 'number' && version > RECORD_VERSION;
  }

  function notify(kind: EntryChangeKind = 'content'): void {
    for (const listener of listeners) listener(entries, kind);
  }

  /** Trailing-debounce handle for the persistence write. */
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  function persistNow(): void {
    persistTimer = undefined;
    if (!hasChromeStorage() || readOnly) return;
    const record: StoredRecord<E> = { version: RECORD_VERSION, entries };
    chrome.storage.local
      .set({ [storageKey]: record })
      .catch((error: unknown) => console.error(`Failed to save the ${noun}:`, error));
  }

  function schedulePersist(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }

  // Flush a pending write when the panel closes, so a change made just
  // before closing is never lost to the debounce window.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistNow();
      }
    });
  }

  function commit(next: E[], kind: EntryChangeKind = 'content'): void {
    entries = next;
    notify(kind);
    schedulePersist();
  }

  function assertWritable(): void {
    if (readOnly) {
      throw new Error(`The ${noun} was saved by a newer version and is read-only here.`);
    }
  }

  // A `trigger → entry` map for the autocomplete, rebuilt lazily on
  // mutation. Case-sensitive, as in LaTeX (and Word's Math AutoCorrect).
  let triggerMap: Map<string, E> | null = null;
  listeners.add(() => {
    triggerMap = null;
  });
  function getTriggerMap(): Map<string, E> {
    if (triggerMap === null) {
      triggerMap = new Map();
      for (const entry of entries) {
        const trigger = triggerOf(entry);
        if (trigger !== undefined && !triggerMap.has(trigger)) triggerMap.set(trigger, entry);
      }
    }
    return triggerMap;
  }

  return {
    async load() {
      if (!hasChromeStorage()) return entries;
      try {
        const stored = await chrome.storage.local.get(storageKey);
        const raw: unknown = stored[storageKey];
        readOnly = isNewerVersion(raw);
        entries = normaliseRecord(raw);
        notify();
      } catch (error) {
        console.error(`Failed to load the ${noun}:`, error);
      }
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[storageKey]) return;
        const raw: unknown = changes[storageKey].newValue;
        const next = normaliseRecord(raw);
        // Skip re-notification for this context's own write echoing back.
        if (JSON.stringify(next) === JSON.stringify(entries)) return;
        readOnly = isNewerVersion(raw);
        entries = next;
        notify();
      });
      return entries;
    },

    get: () => entries,
    isReadOnly: () => readOnly,

    add(fields) {
      assertWritable();
      const now = Date.now();
      const entry = normalise(
        { ...fields, id: makeId(), created: now, modified: now, uses: 0 },
        makeId,
      );
      if (entry === null) throw new Error(`This ${noun} entry has nothing to insert.`);
      commit([...entries, entry]);
      return entry;
    },

    update(id, patch) {
      assertWritable();
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) return null;
      const updated = normalise(
        { ...entries[index]!, ...patch, id, modified: Date.now(), seeded: undefined },
        makeId,
      );
      if (updated === null) return null;
      commit([...entries.slice(0, index), updated, ...entries.slice(index + 1)]);
      return updated;
    },

    restore(entry) {
      assertWritable();
      const restored = normalise(entry, makeId);
      if (restored === null || entries.some((existing) => existing.id === restored.id)) {
        return false;
      }
      commit([...entries, restored]);
      return true;
    },

    delete(id) {
      assertWritable();
      const next = entries.filter((entry) => entry.id !== id);
      if (next.length === entries.length) return false;
      commit(next);
      return true;
    },

    recordUse(id) {
      // Inserting from a read-only store still works – only the counter is
      // skipped, since it could never be persisted.
      if (readOnly) return;
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) return;
      const used = { ...entries[index]!, uses: entries[index]!.uses + 1, lastUsed: Date.now() };
      commit([...entries.slice(0, index), used, ...entries.slice(index + 1)], 'usage');
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    exportJson() {
      const record: EntryExport<E> = {
        version: RECORD_VERSION,
        entries: [...entries],
        exported: Date.now(),
        extension:
          typeof chrome !== 'undefined' && chrome.runtime?.getManifest
            ? chrome.runtime.getManifest().version
            : '',
      };
      return JSON.stringify(record, null, 2);
    },

    // A record from a NEWER schema version is still imported best-effort –
    // import is an explicit user action on a file they chose.
    parseFile(text) {
      try {
        const raw: unknown = JSON.parse(text);
        if (
          raw === null ||
          typeof raw !== 'object' ||
          !Array.isArray((raw as StoredRecord<E>).entries)
        ) {
          return null;
        }
        return normaliseRecord(raw);
      } catch {
        return null;
      }
    },

    // Duplicates are matched on id first, then on content: 'skip' keeps the
    // existing entry, 'keep-both' keeps the imported copy under a fresh id
    // (renamed by the store's `keepBoth`), 'replace' swaps the whole set
    // (the view double-confirms and offers an export first).
    importEntries(imported, strategy, unavailable = () => false) {
      assertWritable();
      const claimed = new Set<string>();
      let untriggered = 0;
      const claimTrigger = (entry: E): E => {
        const trigger = triggerOf(entry);
        if (withoutTrigger === undefined || trigger === undefined) return entry;
        if (claimed.has(trigger) || unavailable(entry)) {
          untriggered++;
          return withoutTrigger(entry);
        }
        claimed.add(trigger);
        return entry;
      };
      if (strategy === 'replace') {
        const removed = entries.length;
        commit(imported.map(claimTrigger));
        return { added: imported.length, skipped: 0, removed, untriggered };
      }
      for (const entry of entries) {
        const trigger = triggerOf(entry);
        if (trigger !== undefined) claimed.add(trigger);
      }
      const ids = new Set(entries.map((entry) => entry.id));
      const contents = new Set(entries.map(contentKey));
      let added = 0;
      let skipped = 0;
      const next = [...entries];
      for (const entry of imported) {
        const duplicate = ids.has(entry.id) || contents.has(contentKey(entry));
        if (duplicate && strategy === 'skip') {
          skipped++;
          continue;
        }
        const kept = claimTrigger(
          duplicate
            ? keepBoth(
                { ...entry, id: makeId() },
                (candidate) => contents.has(contentKey(candidate)) || unavailable(candidate),
              )
            : entry,
        );
        ids.add(kept.id);
        contents.add(contentKey(kept));
        next.push(kept);
        added++;
      }
      commit(next);
      return { added, skipped, removed: 0, untriggered };
    },

    addSeeded(pack) {
      assertWritable();
      const contents = new Set(entries.map(contentKey));
      let added = 0;
      const now = Date.now();
      const next = [...entries];
      for (const fields of pack) {
        const entry = normalise(
          { ...fields, id: makeId(), created: now, modified: now, uses: 0, seeded: true },
          makeId,
        );
        if (entry === null || contents.has(contentKey(entry))) continue;
        contents.add(contentKey(entry));
        next.push(entry);
        added++;
      }
      if (added > 0) commit(next);
      return added;
    },

    removeSeeded() {
      assertWritable();
      const next = entries.filter((entry) => entry.seeded !== true);
      const removed = entries.length - next.length;
      if (removed > 0) commit(next);
      return removed;
    },

    hasSeeded: () => entries.some((entry) => entry.seeded === true),

    findTrigger: (name) => getTriggerMap().get(name) ?? null,

    // The autocomplete's buffer tracker asks this so a trigger longer than
    // an auto-accept command (e.g. `sums` beside `\sum`) is not dropped
    // mid-word.
    isTriggerPrefix(prefix) {
      for (const trigger of getTriggerMap().keys()) {
        if (trigger.startsWith(prefix)) return true;
      }
      return false;
    },
  };
}
