// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createQuickSearch,
  createSymbolSearch,
  installSymbolSearchShortcut,
  loadSearchEngine,
} from './symbol-search';
import type { EditorController } from './editor';

/**
 * Ranking tests run against the real generated index and the real MiniSearch
 * engine – they are the acceptance tests for the whole search feature: a
 * colloquial description must surface the right symbol first. The component
 * tests cover the combobox wiring against a stubbed editor.
 */

function stubEditor() {
  const insert = vi.fn();
  const focus = vi.fn();
  const editor = { insert, focus } as unknown as EditorController;
  return { editor, insert, focus };
}

/** Type into the search box and wait for the results list to settle. */
async function type(input: HTMLInputElement, text: string): Promise<void> {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // Outwait the debounce + engine load.
  await vi.waitFor(
    () => {
      const list = document.getElementById('symbol-search-listbox')!;
      const emptyNote = document.querySelector('.symbol-search__empty')!;
      if (list.hidden && (emptyNote as HTMLElement).hidden) throw new Error('still searching');
    },
    { timeout: 3000 },
  );
}

describe('symbol search ranking', () => {
  it('finds symbols by colloquial description', async () => {
    const engine = (await loadSearchEngine())!;
    expect(engine).not.toBeNull();
    expect(engine.search('open face R')[0]?.c).toBe('\\mathbb{R}');
    expect(engine.search('for all')[0]?.c).toBe('\\forall');
    expect(engine.search('empty set')[0]?.c).toMatch(/^\\(varnothing|emptyset)$/);
    expect(engine.search('infinity')[0]?.c).toBe('\\infty');
  });

  it('finds structural templates by description', async () => {
    const engine = (await loadSearchEngine())!;
    expect(engine.search('fraction')[0]?.c).toBe('\\frac{#?}{#?}');
    const rootResults = engine.search('square root').map((entry) => entry.c);
    expect(rootResults[0]).toBe('\\sqrt{#?}');
    expect(engine.search('piecewise').some((e) => e.c.includes('cases'))).toBe(true);
    expect(engine.search('determinant').some((e) => e.c.includes('vmatrix'))).toBe(true);
  });

  it('finds symbols by entity-style aliases and synonyms', async () => {
    const engine = (await loadSearchEngine())!;
    expect(engine.search('reals')[0]?.c).toBe('\\mathbb{R}');
    expect(engine.search('planck').some((e) => e.c === '\\hbar')).toBe(true);
    expect(engine.search('tensor product')[0]?.c).toBe('\\otimes');
  });

  it('returns nothing for gibberish, and caps the result count', async () => {
    const engine = (await loadSearchEngine())!;
    expect(engine.search('zzzyqqx')).toHaveLength(0);
    expect(engine.search('a').length).toBeLessThanOrEqual(8);
  });
});

describe('library entries in the search', () => {
  it('streams saved entries in live, finds them by name and keywords, and drops deletions', async () => {
    const engine = (await loadSearchEngine())!;
    const library = await import('./library');
    const entry = library.addLibraryEntry({
      name: 'Standard deviation',
      body: '\\sigma=\\sqrt{\\frac{1}{N}\\sum_{i=1}^{N}(x_i-\\mu)^2}',
      keywords: 'spread; dispersion',
    });

    const byName = engine.search('standard deviation');
    expect(byName[0]?.libraryId).toBe(entry.id);
    expect(byName[0]?.c).toBe(entry.body);

    const byKeyword = engine.search('dispersion');
    expect(byKeyword.some((hit) => hit.libraryId === entry.id)).toBe(true);

    // The built-ins still win the queries they should: "sigma" surfaces
    // the Greek letter above the user's entry.
    const sigma = engine.search('sigma');
    expect(sigma.length).toBeGreaterThan(0);
    expect(sigma[0]?.libraryId).toBeUndefined();

    // A rename is searchable within the same synchronous notification…
    library.updateLibraryEntry(entry.id, { name: 'Population spread' });
    expect(engine.search('population spread')[0]?.libraryId).toBe(entry.id);

    // …and a deletion disappears immediately.
    library.deleteLibraryEntry(entry.id);
    expect(engine.search('population spread').some((hit) => hit.libraryId === entry.id)).toBe(
      false,
    );
  });
});

describe('custom shortcuts in the search', () => {
  it('finds a shortcut by name, keywords or trigger letters, live, and drops deletions', async () => {
    const engine = (await loadSearchEngine())!;
    const shortcuts = await import('./shortcuts');
    const named = shortcuts.addShortcut({
      trigger: 'RR',
      latex: '\\mathbb{R}',
      name: 'Real numbers',
      keywords: 'reals',
    });
    const bare = shortcuts.addShortcut({ trigger: 'dxq', latex: '\\,dx' });

    const byName = engine.search('real numbers');
    expect(byName[0]).toMatchObject({ shortcutId: named.id, trigger: 'RR', c: '\\mathbb{R}' });
    expect(engine.search('reals').some((hit) => hit.shortcutId === named.id)).toBe(true);
    // The trigger letters themselves find an unnamed shortcut.
    expect(engine.search('dxq')[0]?.shortcutId).toBe(bare.id);

    shortcuts.updateShortcut(bare.id, { name: 'Differential' });
    expect(engine.search('differential')[0]?.shortcutId).toBe(bare.id);

    shortcuts.deleteShortcut(named.id);
    shortcuts.deleteShortcut(bare.id);
    expect(engine.search('real numbers').some((hit) => hit.shortcutId !== undefined)).toBe(false);
  });
});

describe('symbol search combobox', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is a labelled combobox controlling a listbox', () => {
    const { editor } = stubEditor();
    document.body.appendChild(createSymbolSearch(editor));

    const input = document.getElementById('symbol-search-input') as HTMLInputElement;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-controls')).toBe('symbol-search-listbox');
    const label = document.querySelector('label[for="symbol-search-input"]');
    expect(label?.textContent).toBe('Search symbols');
    expect(document.getElementById('symbol-search-listbox')?.getAttribute('role')).toBe(
      'listbox',
    );
  });

  it('shows options named by description and inserts on Enter without moving focus', async () => {
    const { editor, insert } = stubEditor();
    document.body.appendChild(createSymbolSearch(editor));
    const input = document.getElementById('symbol-search-input') as HTMLInputElement;

    await type(input, 'for all');
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]?.getAttribute('aria-label')).toBe('For all');
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(insert).toHaveBeenCalledWith('\\forall', { focus: false });
  });

  it('moves the active option with arrow keys', async () => {
    const { editor } = stubEditor();
    document.body.appendChild(createSymbolSearch(editor));
    const input = document.getElementById('symbol-search-input') as HTMLInputElement;

    await type(input, 'integral');
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    expect(options.length).toBeGreaterThan(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
  });

  it('Escape closes the list, then clears the query, then returns to the field', async () => {
    const { editor, focus } = stubEditor();
    document.body.appendChild(createSymbolSearch(editor));
    const input = document.getElementById('symbol-search-input') as HTMLInputElement;

    await type(input, 'sum');
    const esc = () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    esc();
    expect(document.getElementById('symbol-search-listbox')?.hidden).toBe(true);
    expect(input.value).toBe('sum');
    esc();
    expect(input.value).toBe('');
    esc();
    expect(focus).toHaveBeenCalled();
  });

  it('Escape dismissal is not undone by a debounce still pending', async () => {
    // Regression: typing a character and pressing Escape inside the debounce
    // window used to let the queued search re-open the list ~150 ms later.
    const { editor } = stubEditor();
    document.body.appendChild(createSymbolSearch(editor));
    const input = document.getElementById('symbol-search-input') as HTMLInputElement;

    await type(input, 'sum');
    // The engine is warm and every step left is timer-driven, so fake
    // timers can run the debounce out deterministically.
    vi.useFakeTimers();
    input.value = 'summ';
    input.dispatchEvent(new Event('input', { bubbles: true })); // debounce armed
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const listbox = document.getElementById('symbol-search-listbox')!;
    expect(listbox.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(400); // past the debounce
    expect(listbox.hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('losing focus cancels a search still in flight', async () => {
    // Regression: a search resolving after focusout used to re-open the
    // listbox under an unfocused input, with no event left to close it.
    const { editor } = stubEditor();
    const root = createSymbolSearch(editor);
    document.body.appendChild(root);
    const input = document.getElementById('symbol-search-input') as HTMLInputElement;

    // Warm the engine first: its import is real I/O that fake timers cannot
    // run out, and a cold engine would leave the list closed for the wrong
    // reason.
    await loadSearchEngine();
    vi.useFakeTimers();
    input.value = 'integral';
    input.dispatchEvent(new Event('input', { bubbles: true })); // debounce armed
    root.dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body }));

    await vi.advanceTimersByTimeAsync(500); // past the debounce
    expect(document.getElementById('symbol-search-listbox')!.hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('the insertion announcement is not overwritten by a stale result count', async () => {
    // Regression: the 400 ms result-count announcement used to fire after
    // Enter's "Inserted …", overwriting it in the live region.
    const region = document.createElement('div');
    region.id = 'sr-status';
    document.body.appendChild(region);
    const { editor } = stubEditor();
    document.body.appendChild(createSymbolSearch(editor));
    const input = document.getElementById('symbol-search-input') as HTMLInputElement;

    // The count announcement is armed when the results render, so the whole
    // search runs on fake timers (with the engine warm) for Enter to have a
    // pending timer to cancel.
    await loadSearchEngine();
    vi.useFakeTimers();
    await type(input, 'for all');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.advanceTimersByTimeAsync(600); // past the count delay
    expect(region.textContent).toBe('Inserted For all');
  });

  it('reports no matches for gibberish', async () => {
    const { editor } = stubEditor();
    document.body.appendChild(createSymbolSearch(editor));
    const input = document.getElementById('symbol-search-input') as HTMLInputElement;

    await type(input, 'zzzyqqx');
    const emptyNote = document.querySelector('.symbol-search__empty') as HTMLElement;
    expect(emptyNote.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the quick search and its Ctrl+/ shortcut', () => {
  let stop: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    stop?.();
  });

  /** Press a key on `target` the way a browser would: it bubbles to document. */
  const press = (target: EventTarget, init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  const mount = () => {
    const stub = stubEditor();
    const quick = createQuickSearch(stub.editor);
    document.body.appendChild(quick.root);
    stop = installSymbolSearchShortcut(quick);
    const input = document.getElementById('quick-search-input') as HTMLInputElement;
    return { ...stub, quick, input };
  };

  it('is hidden until opened, and names its shortcut', () => {
    const { quick, input } = mount();
    expect(quick.root.hidden).toBe(true);
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-keyshortcuts')).toMatch(/\+\/$/);
    expect(document.querySelector('label[for="quick-search-input"]')?.textContent).toBe(
      'Search symbols',
    );
  });

  it('opens with an empty box from anywhere in the panel', () => {
    const { quick, input } = mount();
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    const event = press(elsewhere, { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(quick.root.hidden).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('');
  });

  it('is Cmd+/ on a Mac as well, and pressed again closes back to the field', () => {
    const { quick, focus } = mount();
    press(document.body, { metaKey: true });
    expect(quick.isOpen()).toBe(true);
    press(document.body, { metaKey: true });
    expect(quick.isOpen()).toBe(false);
    expect(focus).toHaveBeenCalled();
  });

  it('Enter inserts the pick, closes and hands focus to the field', async () => {
    const { quick, input, insert } = mount();
    quick.open();
    input.value = 'for all';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      if (document.getElementById('quick-search-listbox')!.hidden) throw new Error('searching');
    }, { timeout: 3000 });

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(insert).toHaveBeenCalledWith('\\forall', { focus: true });
    expect(quick.isOpen()).toBe(false);
    expect(input.value).toBe('');
  });

  it('Escape and Tab close it without inserting and go back to the field', () => {
    const { quick, input, insert, focus } = mount();
    for (const key of ['Escape', 'Tab']) {
      quick.open();
      input.value = 'sum';
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      expect(quick.isOpen()).toBe(false);
    }
    expect(focus).toHaveBeenCalledTimes(2);
    expect(insert).not.toHaveBeenCalled();
  });

  it('closes when focus leaves it', () => {
    const { quick } = mount();
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    quick.open();
    elsewhere.focus();
    expect(quick.isOpen()).toBe(false);
  });

  it('leaves a plain / and every other combination alone', () => {
    const { quick } = mount();
    for (const init of [{}, { shiftKey: true }, { altKey: true }, { ctrlKey: true, metaKey: true }]) {
      expect(press(document.body, init).defaultPrevented).toBe(false);
    }
    expect(quick.isOpen()).toBe(false);
  });
});
