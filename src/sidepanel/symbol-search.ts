/**
 * Symbol search: find any of the ~700 indexed symbols and structural
 * templates by describing them – "for all", "open face R", "square root" –
 * without knowing the LaTeX command. Sits at the top of the Symbols section,
 * above the curated category tabs.
 *
 * The searchable index (src/assets/symbol-index.json, via symbol-index.ts)
 * and the MiniSearch engine are both lazy-loaded on first use, so the
 * panel's first paint never pays for them. No network is involved at any
 * point.
 *
 * Accessibility: the ARIA 1.2 editable-combobox pattern. The input is a
 * combobox controlling an inline listbox (in document flow, like the matrix
 * picker – nothing is overlaid or clipped); Arrow keys move the active
 * option via aria-activedescendant, Enter inserts it without moving focus
 * (the palette convention – consecutive inserts cost one keypress each), and
 * Escape closes the list, then clears the query, then returns to the
 * equation field. Result counts are announced politely, and every option is
 * named by its description ("For all"), never by its glyph.
 */
import type { EditorController } from './editor';
import { SEARCH_SHORTCUT_KEYS, SEARCH_SHORTCUT_LABEL } from './shortcut-labels';
import { createOption, displayName, setActiveOption } from './symbol-list';
import type { ListEntry } from './symbol-list';
import { loadSymbolIndex } from './symbol-index';
import { addRecent } from './recent';
import { announce } from './a11y';
import { bindPart, bindToSettings } from './part-visibility';
import { getLibraryEntries, onLibraryChange, recordLibraryUse } from './library';
import type { LibraryEntry } from './library';
import { spokenName } from './name-maths';
import { getShortcuts, onShortcutsChange, recordShortcutUse, shortcutLabel } from './shortcuts';
import type { Shortcut } from './shortcuts';

export interface SymbolEntry extends ListEntry {
  /**
   * Set on the user's own hits only: the library entry or shortcut id (for
   * usage recording) and its `\`-trigger. Such a hit's `u` is empty – the
   * result row renders the saved LaTeX itself in the glyph slot instead.
   */
  libraryId?: string;
  shortcutId?: string;
  trigger?: string;
}

interface SearchEngine {
  search(query: string): SymbolEntry[];
}

const MAX_RESULTS = 8;
const SEARCH_DEBOUNCE_MS = 150;

/** How a MiniSearch document is built from one of the user's own entries. */
interface OwnEntries<E extends { id: string }> {
  /** Document id prefix: `u:` library, `k:` shortcuts (`s:` is built in). */
  prefix: string;
  get: () => readonly E[];
  onChange: (listener: (entries: readonly E[]) => void) => void;
  /** The searchable prose; a change here re-indexes the document. */
  doc: (entry: E) => { d: string; a: string };
  hit: (entry: E) => SymbolEntry;
}

const LIBRARY: OwnEntries<LibraryEntry> = {
  prefix: 'u:',
  get: getLibraryEntries,
  onChange: onLibraryChange,
  doc: (entry) => ({
    d: `${entry.name}; ${spokenName(entry.name)}; ${entry.keywords ?? ''}`,
    a: entry.category ?? '',
  }),
  hit: (entry) => ({
    c: entry.body,
    u: '',
    d: `${spokenName(entry.name)}; ${entry.keywords ?? ''}`,
    libraryId: entry.id,
    ...(entry.trigger !== undefined ? { trigger: entry.trigger } : {}),
  }),
};

// A shortcut is found by its name, its keywords or the trigger letters
// themselves ("dx" finds \dx), and shows as `\trigger` in the command slot.
const SHORTCUTS: OwnEntries<Shortcut> = {
  prefix: 'k:',
  get: getShortcuts,
  onChange: onShortcutsChange,
  doc: (entry) => ({ d: `${entry.name ?? ''}; ${entry.keywords ?? ''}`, a: entry.trigger }),
  hit: (entry) => ({
    c: entry.latex,
    u: '',
    d: shortcutLabel(entry),
    shortcutId: entry.id,
    trigger: entry.trigger,
  }),
};

let enginePromise: Promise<SearchEngine | null> | null = null;

/**
 * Load MiniSearch and the bundled index on first call; every later call
 * returns the same promise. Resolves to null (search quietly disabled) if
 * either fails to load or the index shape is from a different version.
 *
 * Library entries live in the SAME index as the built-ins – a fourth
 * insertion route on the existing machinery, not a parallel system.
 * Document ids are namespaced (`s:<index>` built-in, `u:<uuid>` library);
 * library mutations stream in live through onLibraryChange (guarded –
 * search degrades quietly, never breaks), and user entries get a modest
 * ranking boost so "my standard deviation" beats a fuzzy built-in match
 * without ever outranking an exact one ("sigma" still finds Σ first).
 */
export function loadSearchEngine(): Promise<SearchEngine | null> {
  enginePromise ??= (async () => {
    try {
      const [{ default: MiniSearch }, indexEntries] = await Promise.all([
        import('minisearch'),
        loadSymbolIndex(),
      ]);
      if (indexEntries === null) return null;
      const mini = new MiniSearch({ fields: ['d', 'a'] });
      mini.addAll(
        indexEntries.map((entry, index) => ({ id: `s:${index}`, d: entry.d, a: entry.a ?? '' })),
      );

      // The user's own side of the index, kept in step with each store. The
      // hit is built from these maps, so an entry whose searchable prose is
      // unchanged (new body, trigger or usage) is refreshed without
      // re-indexing.
      const hits = new Map<string, () => SymbolEntry>();
      const track = <E extends { id: string }>(own: OwnEntries<E>): void => {
        const indexed = new Map<string, E>();
        const key = (entry: E): string => JSON.stringify(own.doc(entry));
        const sync = (entries: readonly E[]): void => {
          try {
            const seen = new Set<string>();
            for (const entry of entries) {
              seen.add(entry.id);
              const previous = indexed.get(entry.id);
              const docId = own.prefix + entry.id;
              if (previous === undefined) {
                mini.add({ id: docId, ...own.doc(entry) });
              } else if (key(previous) !== key(entry)) {
                mini.replace({ id: docId, ...own.doc(entry) });
              }
              indexed.set(entry.id, entry);
              hits.set(docId, () => own.hit(entry));
            }
            for (const id of [...indexed.keys()]) {
              if (seen.has(id)) continue;
              mini.discard(own.prefix + id);
              indexed.delete(id);
              hits.delete(own.prefix + id);
            }
          } catch (error) {
            console.error('Search sync failed:', error);
          }
        };
        sync(own.get());
        own.onChange(sync);
      };
      track(LIBRARY);
      track(SHORTCUTS);

      return {
        search: (query: string): SymbolEntry[] =>
          mini
            .search(query, {
              prefix: true,
              fuzzy: 0.15,
              boost: { d: 3 }, // colloquial names outrank formal aliases
              // Keep typo tolerance, but never let a fuzzy match on a boosted
              // field outrank an exact match ("reals" must find ℝ, not \Re).
              weights: { fuzzy: 0.2, prefix: 0.75 },
              combineWith: 'AND',
              // A gentle nudge for the user's own entries.
              boostDocument: (docId) => (String(docId).startsWith('s:') ? 1 : 1.4),
            })
            .slice(0, MAX_RESULTS)
            .map((result): SymbolEntry | undefined => {
              const id = String(result.id);
              if (id.startsWith('s:')) return indexEntries[Number(id.slice(2))];
              return hits.get(id)?.();
            })
            .filter((entry): entry is SymbolEntry => entry !== undefined),
      };
    } catch (error) {
      console.error('Symbol search is unavailable:', error);
      return null;
    }
  })();
  return enginePromise;
}

export interface SymbolSearchOptions {
  /** Controls placed on the search row, after the input (the Insert… controls). */
  trailing?: HTMLElement[];
  /** Called when the results list opens or closes, so the caller can make room. */
  onListToggle?: (open: boolean) => void;
}

/**
 * Build the search combobox + inline results listbox. The label is visually
 * hidden (the row is the design's "Search symbols" box) and repeated as the
 * placeholder, with the shortcut, so the field is named for everyone.
 */
export function createSymbolSearch(
  editor: EditorController,
  { trailing = [], onListToggle }: SymbolSearchOptions = {},
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'symbol-search';

  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.htmlFor = 'symbol-search-input';
  label.textContent = 'Search symbols';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'symbol-search-input';
  input.className = 'field__control symbol-search__input';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'symbol-search-listbox');
  input.setAttribute('aria-autocomplete', 'list');
  input.autocomplete = 'off';
  input.spellcheck = false;
  // The placeholder is the visible name of the box (the label above is for
  // assistive technology) and it carries the shortcut, since a plain `/`
  // in the field builds a fraction and is the first thing people try.
  input.placeholder = `Search symbols (${SEARCH_SHORTCUT_LABEL})`;
  input.setAttribute('aria-keyshortcuts', SEARCH_SHORTCUT_KEYS);

  // A visible "N results" caption above the list (the live announcement
  // below says the same for screen readers, so this one stays quiet).
  const count = document.createElement('p');
  count.className = 'symbol-search__count';
  count.hidden = true;

  const listbox = document.createElement('ul');
  listbox.id = 'symbol-search-listbox';
  listbox.className = 'symbol-list symbol-search__list';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', 'Matching symbols');
  listbox.hidden = true;

  const empty = document.createElement('p');
  empty.className = 'symbol-search__empty';
  empty.textContent = 'No matching symbols – try another word, or open Drawing to sketch it';
  empty.hidden = true;

  let results: SymbolEntry[] = [];
  let activeIndex = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  // Bumped by close(): a search that was already awaiting the engine when
  // the list was dismissed must throw its results away, not re-open it.
  let searchGeneration = 0;

  const optionId = (index: number): string => `symbol-search-option-${index}`;

  let listOpen = false;
  const setListOpen = (open: boolean): void => {
    listbox.hidden = !open;
    count.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open === listOpen) return;
    listOpen = open;
    onListToggle?.(open);
  };

  const setActive = (index: number): void => {
    if (results.length === 0) return;
    activeIndex = ((index % results.length) + results.length) % results.length;
    setActiveOption(listbox, activeIndex);
    input.setAttribute('aria-activedescendant', optionId(activeIndex));
  };

  const close = (): void => {
    // Dismissal must stick: cancel the pending debounce and orphan any
    // search already in flight, or either would re-open the list unbidden.
    searchGeneration++;
    clearTimeout(searchTimer);
    clearTimeout(announceTimer);
    setListOpen(false);
    empty.hidden = true;
    input.removeAttribute('aria-activedescendant');
  };

  const insertEntry = (entry: SymbolEntry, focusField: boolean): void => {
    const name = displayName(entry);
    editor.insert(entry.c, { focus: focusField });
    // The user's own entries never join Recent (a 12-slot glyph
    // convenience); their own most-recently-used order is the equivalent.
    if (entry.libraryId !== undefined) {
      recordLibraryUse(entry.libraryId);
    } else if (entry.shortcutId !== undefined) {
      recordShortcutUse(entry.shortcutId);
    } else {
      addRecent({ glyph: entry.u, label: name, latex: entry.c });
    }
    // A queued result-count announcement must not overwrite this one.
    clearTimeout(announceTimer);
    announce(`Inserted ${name}`);
    if (focusField) close(); // pointer path: done searching, caret back in view
  };

  const render = (): void => {
    listbox.replaceChildren();
    if (results.length === 0) {
      setListOpen(false);
      empty.hidden = input.value.trim() === '';
      input.removeAttribute('aria-activedescendant');
      return;
    }
    empty.hidden = true;
    results.forEach((entry, index) => {
      // The user's own hit has no single glyph: render the saved LaTeX
      // itself. At most MAX_RESULTS rows, so eager rendering is fine here.
      const own = entry.libraryId !== undefined || entry.shortcutId !== undefined;
      const option = createOption({
        id: optionId(index),
        label: displayName(entry),
        ...(own ? { glyphLatex: entry.c } : { glyph: entry.u }),
        command: own ? (entry.trigger !== undefined ? `\\${entry.trigger}` : '') : entry.c,
      });
      // Keep the caret in the maths field: a click must not move focus first.
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => insertEntry(entry, true));
      option.addEventListener('mouseenter', () => setActive(index));
      listbox.appendChild(option);
    });
    count.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
    setListOpen(true);
    setActive(0);
  };

  const runSearch = async (): Promise<void> => {
    const query = input.value.trim();
    const generation = searchGeneration;
    if (query === '') {
      results = [];
      render();
      return;
    }
    const engine = await loadSearchEngine();
    // Superseded while awaiting: the query changed, or close() dismissed the
    // list (blur, Escape) – a stale search must not re-open it.
    if (engine === null || generation !== searchGeneration || input.value.trim() !== query) {
      return;
    }
    results = engine.search(query);
    render();
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      if (input.value.trim() !== query) return;
      announce(
        results.length === 0
          ? 'No matching symbols'
          : `${results.length} matching symbol${results.length === 1 ? '' : 's'}`,
      );
    }, 400);
  };

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_MS);
  });
  // Warm the engine up as soon as the user shows intent, so the first
  // results appear without a load hiccup.
  input.addEventListener('focus', () => void loadSearchEngine(), { once: true });

  input.addEventListener('keydown', (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (listbox.hidden && input.value.trim() !== '') {
          event.preventDefault();
          void runSearch();
          return;
        }
        if (!listbox.hidden && results.length > 0) {
          event.preventDefault();
          setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
        }
        return;
      }
      case 'Enter': {
        const entry = results[activeIndex];
        if (!listbox.hidden && entry) {
          event.preventDefault();
          insertEntry(entry, false); // focus stays here: search again at once
        }
        return;
      }
      case 'Escape': {
        // Progressive: close the list, then clear the query, then return to
        // the equation field (the palette's Escape convention).
        event.preventDefault();
        event.stopPropagation();
        if (!listbox.hidden || !empty.hidden) {
          close();
        } else if (input.value !== '') {
          input.value = '';
          results = [];
        } else {
          editor.focus();
        }
        return;
      }
      case 'Tab':
        close();
        return;
      default:
        return;
    }
  });

  // Close the list when focus genuinely leaves the search (not when it moves
  // into the listbox scrollbar or bounces within the component). close()
  // also cancels the pending debounce and orphans any in-flight search, so
  // the list cannot pop open again under an unfocused input.
  root.addEventListener('focusout', (event: FocusEvent) => {
    if (!root.contains(event.relatedTarget as Node | null)) close();
  });

  // The search box is one of the pieces of interface a user can switch off
  // (Settings › Interface), so a box that has just left the screen must not
  // leave its results list showing under it. The row itself goes once the box
  // and every control sharing it are off, rather than holding a blank band
  // above the categories; the trailing controls answer to their own flag, so
  // this reads their state rather than deciding it.
  bindPart('symbolSearch', input);
  bindToSettings((settings) => {
    if (!settings.parts.symbolSearch) close();
    root.hidden = !settings.parts.symbolSearch && trailing.every((control) => control.hidden);
  });

  root.append(label, input);
  for (const control of trailing) {
    // The trailing controls live inside this root, so the focusout guard
    // above never fires for them – close the results list explicitly, or
    // stale results would sit between the row and whatever they open.
    control.addEventListener('click', () => close());
    root.append(control);
  }
  root.append(count, listbox, empty);
  return root;
}

/**
 * What the shortcut below and the More ▾ menu's Search symbols item both do:
 * bring the search box on screen (`reveal`), then put the cursor in it with
 * any query already there selected.
 */
export function focusSymbolSearch(reveal: () => void): void {
  reveal();
  const input = document.getElementById('symbol-search-input');
  if (!(input instanceof HTMLInputElement)) return;
  input.scrollIntoView({ block: 'nearest' });
  input.focus();
  input.select();
}

/**
 * Install the panel-wide `Ctrl+/` (`Cmd+/` on a Mac) shortcut: put focus in
 * the search box from anywhere in the panel – the equation field, a symbol
 * tab, another workspace mode – with any query already there selected, so
 * typing replaces it and Escape still walks back to the field.
 *
 * `reveal` is called first: the search box lives in the Symbols mode, and
 * only one mode shows at a time, so a mode that is open has to be closed
 * before there is anything to focus.
 *
 * Matched on `key`, not `code`: `/` sits on different physical keys across
 * layouts, and neither Ctrl nor Cmd changes the character it produces (the
 * reason Alt+C and Alt+S match on `code` instead). Handled in the capture
 * phase so it reaches the shortcut even while focus is inside MathLive's
 * shadow root. Returns an unsubscribe function.
 */
export function installSymbolSearchShortcut(reveal: () => void): () => void {
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== '/' || event.altKey || event.shiftKey) return;
    // Exactly one of the two: Ctrl+Cmd+/ is somebody else's shortcut.
    if (event.ctrlKey === event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    focusSymbolSearch(reveal);
  };
  document.addEventListener('keydown', onKeydown, { capture: true });
  return () => document.removeEventListener('keydown', onKeydown, { capture: true });
}
