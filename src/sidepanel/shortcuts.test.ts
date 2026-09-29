import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The custom shortcuts store shares its persistence with the library
 * (entry-store.ts, covered by library.test.ts), so these tests focus on
 * what a shortcut adds: the trigger as identity, the letters-only rule on
 * load, the trigger lookups, import collisions and the common set.
 */
function fakeChrome() {
  const stored = new Map<string, unknown>();
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: stored.get(key) })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        stored.set(key, JSON.parse(JSON.stringify(value)));
      }
    }),
  };
  return { chrome: { storage: { local, onChanged: { addListener: () => undefined } } }, stored };
}

async function freshShortcuts(seed?: unknown) {
  vi.resetModules();
  const fake = fakeChrome();
  if (seed !== undefined) fake.stored.set('shortcuts', seed);
  vi.stubGlobal('chrome', fake.chrome);
  const shortcuts = await import('./shortcuts');
  await shortcuts.loadShortcuts();
  return { shortcuts, fake };
}

describe('custom shortcuts store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('persists under its own key and reads back after a reload', async () => {
    vi.useFakeTimers();
    const { shortcuts, fake } = await freshShortcuts();
    const added = shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon' });
    expect(shortcuts.updateShortcut(added.id, { name: 'epsilon' })?.name).toBe('epsilon');
    await vi.advanceTimersByTimeAsync(500);
    expect(fake.stored.has('shortcuts')).toBe(true);
    expect(fake.stored.has('library')).toBe(false);

    vi.stubGlobal('chrome', fake.chrome);
    vi.resetModules();
    const reloaded = await import('./shortcuts');
    await reloaded.loadShortcuts();
    expect(reloaded.getShortcuts()).toEqual([expect.objectContaining({ trigger: 'eps', name: 'epsilon' })]);
    expect(reloaded.areShortcutsReadOnly()).toBe(false);
  });

  it('drops an entry whose trigger is not two or more letters, keeping its neighbours', async () => {
    const { shortcuts } = await freshShortcuts({
      version: 1,
      entries: [
        { id: 'a', trigger: 'dx', latex: '\\,dx', uses: 0 },
        { id: 'b', trigger: 'd2', latex: 'x', uses: 0 },
        { id: 'e', trigger: 'd', latex: 'x', uses: 0 },
        { id: 'c', trigger: '', latex: 'x', uses: 0 },
        { id: 'd', trigger: 'nolatex', uses: 0 },
      ],
    });
    expect(shortcuts.getShortcuts().map((s) => s.id)).toEqual(['a']);
  });

  it('refuses to store an unusable shortcut', async () => {
    const { shortcuts } = await freshShortcuts();
    expect(() => shortcuts.addShortcut({ trigger: 'a b', latex: 'x' })).toThrow();
    expect(() => shortcuts.addShortcut({ trigger: 'ab', latex: '   ' })).toThrow();
    expect(shortcuts.getShortcuts()).toEqual([]);
  });

  it('resolves triggers exactly, case-sensitively, and knows their prefixes', async () => {
    const { shortcuts } = await freshShortcuts();
    shortcuts.addShortcut({ trigger: 'RR', latex: '\\mathbb{R}' });
    shortcuts.addShortcut({ trigger: 'sums', latex: '\\sum_{i=1}^{n}' });
    expect(shortcuts.findShortcut('RR')?.latex).toBe('\\mathbb{R}');
    expect(shortcuts.findShortcut('rr')).toBeNull();
    expect(shortcuts.isShortcutPrefix('su')).toBe(true);
    expect(shortcuts.isShortcutPrefix('sum')).toBe(true);
    expect(shortcuts.isShortcutPrefix('sumx')).toBe(false);
    expect(shortcuts.isShortcutPrefix('')).toBe(true);
  });

  it('announces the name when there is one, else the trigger', async () => {
    const { shortcuts } = await freshShortcuts();
    const named = shortcuts.addShortcut({ trigger: 'RR', latex: '\\mathbb{R}', name: 'Reals' });
    const bare = shortcuts.addShortcut({ trigger: 'dx', latex: '\\,dx' });
    expect(shortcuts.shortcutLabel(named)).toBe('Reals');
    expect(shortcuts.shortcutLabel(bare)).toBe('\\dx');
  });

  it('undo restores a deleted shortcut exactly and records use', async () => {
    const { shortcuts } = await freshShortcuts();
    const added = shortcuts.addShortcut({ trigger: 'dx', latex: '\\,dx' });
    shortcuts.recordShortcutUse(added.id);
    const [used] = shortcuts.getShortcuts();
    expect(used!.uses).toBe(1);
    expect(shortcuts.deleteShortcut(added.id)).toBe(true);
    expect(shortcuts.restoreShortcut(used!)).toBe(true);
    expect(shortcuts.getShortcuts()[0]).toEqual(used);
    expect(shortcuts.restoreShortcut(used!)).toBe(false);
  });

  it('notifies listeners with the change kind', async () => {
    const { shortcuts } = await freshShortcuts();
    const kinds: string[] = [];
    shortcuts.onShortcutsChange((_entries, kind) => kinds.push(kind));
    const added = shortcuts.addShortcut({ trigger: 'dx', latex: '\\,dx' });
    shortcuts.recordShortcutUse(added.id);
    expect(kinds).toEqual(['content', 'usage']);
  });

  it('imports with skip, keep-both (letter suffix) and replace', async () => {
    const { shortcuts } = await freshShortcuts();
    const mine = shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon' });
    const file = shortcuts.exportShortcuts();
    expect(JSON.parse(file)).toMatchObject({ version: 1 });
    const parsed = shortcuts.parseShortcutsFile(file)!;
    expect(parsed).toHaveLength(1);
    expect(shortcuts.parseShortcutsFile('nonsense')).toBeNull();

    // Same id and same trigger are both duplicates.
    const incoming = [
      { ...mine },
      { ...mine, id: 'other', latex: '\\epsilon' },
      { ...mine, id: 'fresh', trigger: 'dx', latex: '\\,dx' },
    ];
    expect(shortcuts.importShortcuts(incoming, 'skip')).toEqual({ added: 1, skipped: 2, removed: 0, untriggered: 0 });
    expect(shortcuts.getShortcuts().map((s) => s.trigger)).toEqual(['eps', 'dx']);

    expect(shortcuts.importShortcuts([{ ...mine }], 'keep-both')).toEqual({
      added: 1,
      skipped: 0,
      removed: 0,
      untriggered: 0,
    });
    const copy = shortcuts.getShortcuts().at(-1)!;
    expect(copy.trigger).toBe('epsb');
    expect(copy.id).not.toBe(mine.id);

    expect(shortcuts.importShortcuts(parsed, 'replace')).toEqual({ added: 1, skipped: 0, removed: 3, untriggered: 0 });
    expect(shortcuts.getShortcuts().map((s) => s.trigger)).toEqual(['eps']);
  });

  it('always finds a free trigger for a kept copy, past the single-letter suffixes', async () => {
    const { shortcuts } = await freshShortcuts();
    const single = new Set([...'bcdefghijklmnopqrstuvwxyz'].map((letter) => `eps${letter}`));
    expect(shortcuts.freeTrigger('eps', () => false)).toBe('epsb');
    expect(shortcuts.freeTrigger('eps', (t) => single.has(t))).toBe('epsaa');
    expect(shortcuts.freeTrigger('eps', (t) => single.has(t) || t === 'epsaa')).toBe('epsab');

    const copies = Array.from({ length: 30 }, (_, i) => ({
      id: `copy-${i}`,
      trigger: 'eps',
      latex: String(i),
      created: 0,
      modified: 0,
      uses: 0,
    }));
    shortcuts.importShortcuts(copies, 'keep-both');
    const triggers = shortcuts.getShortcuts().map((s) => s.trigger);
    expect(new Set(triggers).size).toBe(30);
  });

  it('keeps a renamed copy clear of what the caller marks unavailable', async () => {
    const { shortcuts } = await freshShortcuts();
    shortcuts.addShortcut({ trigger: 'zz', latex: '1' });
    const copy = { id: 'x', trigger: 'zz', latex: '2', created: 0, modified: 0, uses: 0 };
    shortcuts.importShortcuts([copy], 'keep-both', (candidate) => candidate.trigger === 'zzb');
    expect(shortcuts.getShortcuts().map((s) => s.trigger)).toEqual(['zz', 'zzc']);
  });

  it('adds and removes the common set without touching edited or own shortcuts', async () => {
    const { shortcuts } = await freshShortcuts();
    const { COMMON_SHORTCUTS } = await import('./shortcuts-common');
    shortcuts.addShortcut({ trigger: 'mine', latex: 'm' });
    expect(shortcuts.addSeededShortcuts(COMMON_SHORTCUTS)).toBe(COMMON_SHORTCUTS.length);
    expect(shortcuts.hasSeededShortcuts()).toBe(true);
    expect(shortcuts.addSeededShortcuts(COMMON_SHORTCUTS)).toBe(0);
    const first = shortcuts.getShortcuts().find((s) => s.seeded)!;
    shortcuts.updateShortcut(first.id, { name: 'Edited' });
    expect(shortcuts.removeSeededShortcuts()).toBe(COMMON_SHORTCUTS.length - 1);
    expect(shortcuts.getShortcuts().map((s) => s.trigger).sort()).toEqual(
      ['mine', first.trigger].sort(),
    );
    expect(shortcuts.hasSeededShortcuts()).toBe(false);
  });

  it('every common shortcut renders, is letters only and is not already a command', async () => {
    const { COMMON_SHORTCUTS } = await import('./shortcuts-common');
    const { validateLatex } = await import('mathlive');
    const { TRIGGER_PATTERN } = await import('./shortcuts');
    expect(COMMON_SHORTCUTS.length).toBeGreaterThanOrEqual(40);
    for (const shortcut of COMMON_SHORTCUTS) {
      expect(TRIGGER_PATTERN.test(shortcut.trigger), shortcut.trigger).toBe(true);
      expect(validateLatex(shortcut.latex), `\\${shortcut.trigger} must render`).toEqual([]);
      expect(validateLatex(`\\${shortcut.trigger}`), `\\${shortcut.trigger} must be free`).not.toEqual([]);
    }
    const triggers = COMMON_SHORTCUTS.map((s) => s.trigger);
    expect(new Set(triggers).size).toBe(triggers.length);
  });
});
