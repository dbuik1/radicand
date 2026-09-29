import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The store is exercised against a fake `chrome.storage.local` (get/set
 * plus an onChanged emitter), so persistence, reload, tolerant parsing,
 * read-only mode and second-panel propagation are all covered without a
 * browser. The module is re-imported fresh per test via vi.resetModules –
 * its state is module-level, like settings.ts.
 */
type ChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void;

function fakeChrome() {
  const stored = new Map<string, unknown>();
  const changeListeners: ChangeListener[] = [];
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: stored.get(key) })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        const oldValue = stored.get(key);
        // Structured-clone semantics: storage holds data, not references.
        const cloned: unknown = JSON.parse(JSON.stringify(value));
        stored.set(key, cloned);
        for (const listener of changeListeners) {
          listener({ [key]: { newValue: cloned, oldValue } }, 'local');
        }
      }
    }),
  };
  const chrome = {
    storage: {
      local,
      onChanged: {
        addListener: (listener: ChangeListener) => changeListeners.push(listener),
      },
    },
  };
  return { chrome, stored, emit: (changes: Parameters<ChangeListener>[0]) => {
    for (const listener of changeListeners) listener(changes, 'local');
  } };
}

async function freshLibrary(seed?: unknown) {
  vi.resetModules();
  const fake = fakeChrome();
  if (seed !== undefined) fake.stored.set('library', seed);
  vi.stubGlobal('chrome', fake.chrome);
  const library = await import('./library');
  await library.loadLibrary();
  return { library, fake };
}

describe('expression library store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('adds, edits, deletes and re-reads entries across a reload', async () => {
    vi.useFakeTimers();
    const { library, fake } = await freshLibrary();
    const saved = library.addLibraryEntry({ name: 'Einstein temperature', body: '\\theta_E' });
    library.addLibraryEntry({ name: 'To delete', body: 'x' });
    expect(library.getLibraryEntries()).toHaveLength(2);

    const renamed = library.updateLibraryEntry(saved.id, { name: 'θE definition' });
    expect(renamed?.name).toBe('θE definition');
    expect(renamed!.modified).toBeGreaterThanOrEqual(saved.modified);

    expect(library.deleteLibraryEntry(library.getLibraryEntries()[1]!.id)).toBe(true);
    await vi.advanceTimersByTimeAsync(500); // past the write debounce

    // A fresh module against the same storage sees the persisted state.
    vi.stubGlobal('chrome', fake.chrome);
    vi.resetModules();
    const reloaded = await import('./library');
    await reloaded.loadLibrary();
    expect(reloaded.getLibraryEntries()).toHaveLength(1);
    expect(reloaded.getLibraryEntries()[0]!.name).toBe('θE definition');
    expect(reloaded.getLibraryEntries()[0]!.id).toBe(saved.id);
  });

  it('coalesces rapid edits into one debounced write', async () => {
    vi.useFakeTimers();
    const { library, fake } = await freshLibrary();
    const entry = library.addLibraryEntry({ name: 'a', body: 'x' });
    library.updateLibraryEntry(entry.id, { name: 'b' });
    library.updateLibraryEntry(entry.id, { name: 'c' });
    expect(fake.chrome.storage.local.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('drops a malformed entry without losing its neighbours', async () => {
    const good = {
      id: 'keep',
      name: 'Kept',
      body: '\\sqrt{\\placeholder{}}',
      created: 5,
      modified: 6,
      uses: 3,
    };
    const { library } = await freshLibrary({
      version: 1,
      entries: [good, { id: 'no-body', name: 'Broken' }, 'junk', null],
    });
    const entries = library.getLibraryEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject(good);
    expect(library.isLibraryReadOnly()).toBe(false);
  });

  it('tolerates a record that is not an object at all', async () => {
    const { library } = await freshLibrary('scrambled');
    expect(library.getLibraryEntries()).toEqual([]);
    expect(() => library.addLibraryEntry({ name: 'n', body: 'x' })).not.toThrow();
  });

  it('treats a newer-version record as read-only and refuses mutations', async () => {
    const { library, fake } = await freshLibrary({
      version: 2,
      entries: [{ id: 'future', name: 'From the future', body: 'y', uses: 0 }],
    });
    expect(library.isLibraryReadOnly()).toBe(true);
    // Best-effort read of what this build understands…
    expect(library.getLibraryEntries()[0]?.name).toBe('From the future');
    // …but never a write that would destroy the newer format.
    expect(() => library.addLibraryEntry({ name: 'n', body: 'x' })).toThrow(/read-only/);
    expect(() => library.deleteLibraryEntry('future')).toThrow(/read-only/);
    library.recordLibraryUse('future'); // silently skipped, never persisted
    expect(fake.chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('follows a change made by a second panel instance', async () => {
    const { library, fake } = await freshLibrary();
    const seen: number[] = [];
    library.onLibraryChange((entries) => seen.push(entries.length));
    fake.emit({
      library: {
        newValue: {
          version: 1,
          entries: [{ id: 'other', name: 'From the other panel', body: 'z', uses: 0 }],
        },
      },
    });
    expect(library.getLibraryEntries()).toHaveLength(1);
    expect(library.getLibraryEntries()[0]!.name).toBe('From the other panel');
    expect(seen).toEqual([1]);
  });

  it('does not re-notify for its own write echoing back', async () => {
    vi.useFakeTimers();
    const { library } = await freshLibrary();
    let notifications = 0;
    library.onLibraryChange(() => notifications++);
    library.addLibraryEntry({ name: 'a', body: 'x' });
    expect(notifications).toBe(1);
    await vi.advanceTimersByTimeAsync(500); // the persisted write echoes via onChanged
    expect(notifications).toBe(1);
  });

  it('records use for the recently-used sort', async () => {
    const { library } = await freshLibrary();
    const entry = library.addLibraryEntry({ name: 'a', body: 'x' });
    library.recordLibraryUse(entry.id);
    library.recordLibraryUse(entry.id);
    const [stored] = library.getLibraryEntries();
    expect(stored!.uses).toBe(2);
    expect(stored!.lastUsed).toBeGreaterThan(0);
  });

  it('clears the seeded flag once a starter entry is edited', async () => {
    const { library } = await freshLibrary();
    const entry = library.addLibraryEntry({ name: 'Quadratic', body: 'x', seeded: true });
    expect(entry.seeded).toBe(true);
    const edited = library.updateLibraryEntry(entry.id, { name: 'Mine now' });
    expect(edited!.seeded).toBeUndefined();
  });

  it('exports a record another profile imports intact', async () => {
    const { library } = await freshLibrary();
    library.addLibraryEntry({ name: 'Mine', body: 'x+1', keywords: 'k1', trigger: 'mine' });
    const exported = library.exportLibrary();
    expect(JSON.parse(exported)).toMatchObject({ version: 1 });

    // A second, empty profile.
    vi.resetModules();
    vi.stubGlobal('chrome', undefined);
    const other = await import('./library');
    const parsed = other.parseLibraryFile(exported)!;
    expect(parsed).toHaveLength(1);
    const result = other.importLibraryEntries(parsed, 'skip');
    expect(result).toEqual({ added: 1, skipped: 0, removed: 0, untriggered: 0 });
    expect(other.getLibraryEntries()[0]).toMatchObject({
      name: 'Mine',
      body: 'x+1',
      keywords: 'k1',
      trigger: 'mine',
    });
  });

  it('rejects a file that is not a library', async () => {
    const { library } = await freshLibrary();
    expect(library.parseLibraryFile('not json at all')).toBeNull();
    expect(library.parseLibraryFile('{"some":"object"}')).toBeNull();
  });

  it('skips duplicates by id and by (name, body); keep-both renames instead', async () => {
    const { library } = await freshLibrary();
    const mine = library.addLibraryEntry({ name: 'Shared', body: 'x' });
    const incoming = [
      { ...mine }, // same id
      { ...mine, id: 'other-id', name: 'shared', body: 'x' }, // same content
      { ...mine, id: 'fresh-id', name: 'Different', body: 'y' },
    ];
    const skip = library.importLibraryEntries(incoming, 'skip');
    expect(skip).toEqual({ added: 1, skipped: 2, removed: 0, untriggered: 0 });
    expect(library.getLibraryEntries()).toHaveLength(2);

    const keepBoth = library.importLibraryEntries([{ ...mine }], 'keep-both');
    expect(keepBoth).toEqual({ added: 1, skipped: 0, removed: 0, untriggered: 0 });
    const copy = library.getLibraryEntries().at(-1)!;
    expect(copy.name).toBe('Shared (imported)');
    expect(copy.id).not.toBe(mine.id);
  });

  it('never imports a trigger that is already taken; the formula comes in without it', async () => {
    const { library } = await freshLibrary();
    const mine = library.addLibraryEntry({ name: 'Quadratic', body: 'x^2', trigger: 'quad' });
    const incoming = [
      { ...mine }, // kept as a copy: the original keeps \quad
      { ...mine, id: 'b', name: 'Other', body: 'y', trigger: 'quad' }, // clashes with mine
      { ...mine, id: 'c', name: 'First', body: 'z', trigger: 'zed' },
      { ...mine, id: 'd', name: 'Second', body: 'w', trigger: 'zed' }, // repeats the file's own
      { ...mine, id: 'e', name: 'Blocked', body: 'v', trigger: 'blocked' }, // taken elsewhere
    ];
    const result = library.importLibraryEntries(incoming, 'keep-both', (entry) => entry.trigger === 'blocked');
    expect(result).toEqual({ added: 5, skipped: 0, removed: 0, untriggered: 4 });
    const byTrigger = (trigger: string) =>
      library.getLibraryEntries().filter((entry) => entry.trigger === trigger).map((entry) => entry.name);
    expect(byTrigger('quad')).toEqual(['Quadratic']);
    expect(byTrigger('zed')).toEqual(['First']);
    expect(byTrigger('blocked')).toEqual([]);
    expect(library.findLibraryTrigger('quad')?.id).toBe(mine.id);

    const replaced = library.importLibraryEntries(incoming.slice(1), 'replace');
    expect(replaced.untriggered).toBe(1); // only the file's own repeat of \zed
  });

  it('replace swaps the whole library and reports what went', async () => {
    const { library } = await freshLibrary();
    library.addLibraryEntry({ name: 'Old A', body: 'a' });
    library.addLibraryEntry({ name: 'Old B', body: 'b' });
    const incoming = library.parseLibraryFile(
      JSON.stringify({ version: 1, entries: [{ id: 'n1', name: 'New', body: 'n', uses: 0 }] }),
    )!;
    const result = library.importLibraryEntries(incoming, 'replace');
    expect(result).toEqual({ added: 1, skipped: 0, removed: 2, untriggered: 0 });
    expect(library.getLibraryEntries().map((entry) => entry.name)).toEqual(['New']);
  });

  it('adds and cleanly removes the starter pack without touching edited entries', async () => {
    const { library } = await freshLibrary();
    const { STARTER_PACK } = await import('./library-starter');
    library.addLibraryEntry({ name: 'My own', body: 'z' });
    const added = library.addSeededEntries(STARTER_PACK);
    expect(added).toBe(STARTER_PACK.length);
    expect(library.hasSeededEntries()).toBe(true);
    // Adding again is a no-op (same name+body).
    expect(library.addSeededEntries(STARTER_PACK)).toBe(0);

    // Editing one makes it the user's own…
    const pythagoras = library
      .getLibraryEntries()
      .find((entry) => entry.name === 'Pythagoras')!;
    library.updateLibraryEntry(pythagoras.id, { name: 'My Pythagoras' });

    // …so removal takes back everything still seeded, and nothing else.
    const removed = library.removeSeededEntries();
    expect(removed).toBe(STARTER_PACK.length - 1);
    expect(library.getLibraryEntries().map((entry) => entry.name).sort()).toEqual([
      'My Pythagoras',
      'My own',
    ]);
    expect(library.hasSeededEntries()).toBe(false);
  });

  it('every starter formula renders and none ships a trigger', async () => {
    const { STARTER_PACK } = await import('./library-starter');
    const { validateLatex } = await import('mathlive');
    expect(STARTER_PACK.length).toBeGreaterThanOrEqual(12);
    expect(STARTER_PACK.length).toBeLessThanOrEqual(20);
    for (const entry of STARTER_PACK) {
      expect(validateLatex(entry.body), `${entry.name} must render`).toEqual([]);
      expect(entry.trigger, `${entry.name} must not claim a trigger`).toBeUndefined();
    }
    const names = STARTER_PACK.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('works without chrome.storage at all (unit-test fallback)', async () => {
    vi.resetModules();
    vi.stubGlobal('chrome', undefined);
    const library = await import('./library');
    await library.loadLibrary();
    const entry = library.addLibraryEntry({ name: 'in-memory', body: 'x' });
    expect(library.getLibraryEntries()).toHaveLength(1);
    expect(library.deleteLibraryEntry(entry.id)).toBe(true);
  });
});
