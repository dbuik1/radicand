import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The composed trigger namespace: shortcuts and library triggers reach the
 * field through one lookup, and the authoring forms validate against both.
 */
async function fresh() {
  vi.resetModules();
  vi.stubGlobal('chrome', undefined);
  const library = await import('./library');
  const shortcuts = await import('./shortcuts');
  const triggers = await import('./triggers');
  return { library, shortcuts, triggers };
}

describe('trigger registry', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('resolves shortcuts and library triggers through one lookup', async () => {
    const { library, shortcuts, triggers } = await fresh();
    const formula = library.addLibraryEntry({ name: 'Pythagoras', body: 'a^2+b^2=c^2', trigger: 'pyth' });
    const shortcut = shortcuts.addShortcut({ trigger: 'RR', latex: '\\mathbb{R}' });
    expect(triggers.editorTriggers.lookup('pyth')).toEqual({
      id: formula.id,
      trigger: 'pyth',
      name: 'Pythagoras',
      body: 'a^2+b^2=c^2',
    });
    expect(triggers.editorTriggers.lookup('RR')).toEqual({
      id: shortcut.id,
      trigger: 'RR',
      name: '\\RR',
      body: '\\mathbb{R}',
    });
    expect(triggers.editorTriggers.lookup('nope')).toBeNull();
    expect(triggers.editorTriggers.isPrefix('py')).toBe(true);
    expect(triggers.editorTriggers.isPrefix('R')).toBe(true);
    expect(triggers.editorTriggers.isPrefix('q')).toBe(false);
    // The finder's list carries both, shortcuts first, and follows changes.
    expect(triggers.editorTriggers.list().map((entry) => entry.trigger)).toEqual(['RR', 'pyth']);
    shortcuts.deleteShortcut(shortcut.id);
    expect(triggers.editorTriggers.list().map((entry) => entry.trigger)).toEqual(['pyth']);
  });

  it('a shortcut wins over a library entry with the same trigger', async () => {
    const { library, shortcuts, triggers } = await fresh();
    library.addLibraryEntry({ name: 'Formula', body: 'f', trigger: 'same' });
    shortcuts.addShortcut({ trigger: 'same', latex: 's' });
    expect(triggers.editorTriggers.lookup('same')?.body).toBe('s');
  });

  it('records use on the store that owns the id', async () => {
    const { library, shortcuts, triggers } = await fresh();
    const formula = library.addLibraryEntry({ name: 'F', body: 'f', trigger: 'ff' });
    const shortcut = shortcuts.addShortcut({ trigger: 'ss', latex: 's' });
    triggers.editorTriggers.recordUse(formula.id);
    triggers.editorTriggers.recordUse(shortcut.id);
    triggers.editorTriggers.recordUse(shortcut.id);
    expect(library.getLibraryEntries()[0]!.uses).toBe(1);
    expect(shortcuts.getShortcuts()[0]!.uses).toBe(2);
  });

  it('validates a trigger against LaTeX and both namespaces', async () => {
    const { library, shortcuts, triggers } = await fresh();
    const formula = library.addLibraryEntry({ name: 'F', body: 'f', trigger: 'pyth' });
    const shortcut = shortcuts.addShortcut({ trigger: 'RR', latex: 'r' });
    const { triggerProblem } = triggers;
    expect(triggerProblem('')).toBeNull();
    expect(triggerProblem('a1')).toMatch(/only contain letters/);
    expect(triggerProblem('a')).toMatch(/at least two letters/);
    expect(triggerProblem('alpha')).toMatch(/already a LaTeX command/);
    expect(triggerProblem('pyth')).toMatch(/library formula already uses/);
    expect(triggerProblem('RR')).toMatch(/custom shortcut already uses/);
    // Editing an entry never collides with itself.
    expect(triggerProblem('pyth', formula.id)).toBeNull();
    expect(triggerProblem('RR', shortcut.id)).toBeNull();
    // A strict prefix of a command is fine: triggers never auto-accept.
    expect(triggerProblem('alph')).toBeNull();
  });
});
