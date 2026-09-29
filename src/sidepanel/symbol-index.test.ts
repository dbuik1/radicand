import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('the symbol index loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('serves the bundled entries to every caller from one load', async () => {
    const { loadSymbolIndex } = await import('./symbol-index');
    const first = loadSymbolIndex();
    const second = loadSymbolIndex();
    expect(second).toBe(first);
    const entries = await first;
    expect(entries).not.toBeNull();
    expect(entries!.length).toBeGreaterThan(100);
    expect(entries!.some((entry) => entry.c === '\\forall')).toBe(true);
  });

  it('refuses an index of another version once, and every caller gets null', async () => {
    vi.doMock('../assets/symbol-index.json', () => ({
      default: { version: 2, entries: [{ c: '\\forall', u: '∀', d: 'For all' }] },
    }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { loadSymbolIndex } = await import('./symbol-index');
    expect(await loadSymbolIndex()).toBeNull();
    expect(await loadSymbolIndex()).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toBe('Symbol index version 2 is not supported.');

    // Both consumers degrade from that one refusal: the search is off, the
    // finder falls back to bare command names.
    const { loadSearchEngine } = await import('./symbol-search');
    expect(await loadSearchEngine()).toBeNull();
    const { loadCommandCandidates } = await import('./editor/command-index');
    const candidates = await loadCommandCandidates();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.glyph === '' && candidate.terms.length === 0)).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    vi.doUnmock('../assets/symbol-index.json');
  });
});
