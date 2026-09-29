/**
 * Symbol search: find any of the ~700 indexed symbols and structural
 * templates by describing them – "for all", "open face R", "square root" –
 * without knowing the LaTeX command. Two boxes share it: the Symbols search,
 * at the top of the Symbols section above the curated category tabs, and the
 * quick search that Ctrl+/ opens under the equation field.
 *
 * The searchable index (src/assets/symbol-index.json, via symbol-index.ts)
 * and the MiniSearch engine are both lazy-loaded on first use, so the
 * panel's first paint never pays for them. No network is involved at any
 * point.
 *
 * Accessibility: the ARIA 1.2 editable-combobox pattern. The input is a
 * combobox controlling an inline listbox (in document flow, like the matrix
 * picker – nothing is overlaid or clipped); Arrow keys move the active
 * option via aria-activedescendant. In the Symbols box, Enter inserts
 * without moving focus (the palette convention – consecutive inserts cost
 * one keypress each) and Escape closes the list, then clears the query, then
 * returns to the equation field; the quick search closes on either and hands
 * focus back to the field. Result counts are announced politely, and every option is
 * named by its description ("For all"), never by its glyph.
 */
import type { EditorController } from './editor';
import { SEARCH_SHORTCUT_KEYS } from './shortcut-labels';
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

/** One search box and its results, before either owner adds its own keys. */
export interface SearchCombobox {
  label: HTMLLabelElement;
  input: HTMLInputElement;
  count: HTMLParagraphElement;
  listbox: HTMLUListElement;
  empty: HTMLParagraphElement;
  /** Close the list and orphan any search still pending or in flight. */
  close: () => void;
  /** Whether the list or the no-matches note is showing. */
  isShowingResults: () => boolean;
}

/**
 * Each search's class names, written out whole so the stylesheet check can
 * see that every rule in styles.css has an element to style.
 */
const COMBOBOX_CLASSES = {
  'symbol-search': {
    input: 'symbol-search__input',
    count: 'symbol-search__count',
    list: 'symbol-search__list',
    empty: 'symbol-search__empty',
  },
  'quick-search': {
    input: 'quick-search__input',
    count: 'quick-search__count',
    list: 'quick-search__list',
    empty: 'quick-search__empty',
  },
} as const;

export interface SearchComboboxOptions {
  /** Id prefix (`<prefix>-input`, `<prefix>-listbox`) and class set. */
  prefix: keyof typeof COMBOBOX_CLASSES;
  placeholder: string;
  /**
   * Where focus goes after Enter inserts: 'stay' keeps it in the box so the
   * next search costs nothing; 'field' hands it to the equation field.
   */
  afterEnter: 'stay' | 'field';
  /** Called when the results list opens or closes. */
  onListToggle?: (open: boolean) => void;
  /** Called after every insertion, whichever way it was made. */
  onInserted?: () => void;
}

/**
 * The combobox both searches share: a labelled input controlling an inline
 * listbox, a result count, a no-matches note, the debounced search, arrow
 * keys and Enter. Escape, Tab and leaving the box are the owner's to handle,
 * since the Symbols box and the quick search close differently.
 */
function createSearchCombobox(
  editor: EditorController,
  { prefix, placeholder, afterEnter, onListToggle, onInserted }: SearchComboboxOptions,
): SearchCombobox {
  const classes = COMBOBOX_CLASSES[prefix];
  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.htmlFor = `${prefix}-input`;
  label.textContent = 'Search symbols';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = `${prefix}-input`;
  input.className = `field__control ${classes.input}`;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${prefix}-listbox`);
  input.setAttribute('aria-autocomplete', 'list');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;

  // A visible "N results" caption above the list (the live announcement
  // below says the same for screen readers, so this one stays quiet).
  const count = document.createElement('p');
  count.className = classes.count;
  count.hidden = true;

  const listbox = document.createElement('ul');
  listbox.id = `${prefix}-listbox`;
  listbox.className = `symbol-list ${classes.list}`;
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', 'Matching symbols');
  listbox.hidden = true;

  const empty = document.createElement('p');
  empty.className = classes.empty;
  empty.textContent = 'No matching symbols – try another word, or open Drawing to sketch it';
  empty.hidden = true;

  let results: SymbolEntry[] = [];
  let activeIndex = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  // Bumped by close(): a search that was already awaiting the engine when
  // the list was dismissed must throw its results away, not re-open it.
  let searchGeneration = 0;

  const optionId = (index: number): string => `${prefix}-option-${index}`;

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
    if (focusField) close(); // done searching, caret back in view
    onInserted?.();
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
          insertEntry(entry, afterEnter === 'field');
        }
        return;
      }
      default:
        return;
    }
  });

  return {
    label,
    input,
    count,
    listbox,
    empty,
    close,
    isShowingResults: () => !listbox.hidden || !empty.hidden,
  };
}

export interface SymbolSearchOptions {
  /** Controls placed on the search row, after the input (the Insert… controls). */
  trailing?: HTMLElement[];
  /** Called when the results list opens or closes, so the caller can make room. */
  onListToggle?: (open: boolean) => void;
}

/**
 * The Symbols search box, above the category chips: for browsing, so Enter
 * inserts and keeps focus here for the next search. The label is visually
 * hidden (the row is the design's "Search symbols" box) and repeated as the
 * placeholder, so the field is named for everyone.
 */
export function createSymbolSearch(
  editor: EditorController,
  { trailing = [], onListToggle }: SymbolSearchOptions = {},
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'symbol-search';

  const search = createSearchCombobox(editor, {
    prefix: 'symbol-search',
    placeholder: 'Search symbols',
    afterEnter: 'stay',
    ...(onListToggle ? { onListToggle } : {}),
  });
  const { input, close } = search;

  input.addEventListener('keydown', (event: KeyboardEvent) => {
    switch (event.key) {
      case 'Escape': {
        // Progressive: close the list, then clear the query, then return to
        // the equation field (the palette's Escape convention).
        event.preventDefault();
        event.stopPropagation();
        if (search.isShowingResults()) {
          close();
        } else if (input.value !== '') {
          input.value = '';
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

  root.append(search.label, input);
  for (const control of trailing) {
    // The trailing controls live inside this root, so the focusout guard
    // above never fires for them – close the results list explicitly, or
    // stale results would sit between the row and whatever they open.
    control.addEventListener('click', () => close());
    root.append(control);
  }
  root.append(search.count, search.listbox, search.empty);
  return root;
}

/** The quick search, as main.ts wires it to the shortcut and the menus. */
export interface QuickSearch {
  root: HTMLElement;
  /** Open it with an empty query and focus in its box. */
  open: () => void;
  /** Close it; with `toField`, hand focus back to the equation field. */
  close: (toField: boolean) => void;
  isOpen: () => boolean;
}

/** Longer than MathLive's deferred field focus, shorter than a keypress. */
const FIELD_REFOCUS_GRACE_MS = 150;

/**
 * The quick search: a search box that opens directly under the equation
 * field, where the `\` finder's list appears, so a symbol can be found by
 * description without leaving the equation. It is transient – a pick inserts
 * at the caret, closes the box and puts focus back in the field; Escape or
 * Tab closes it without inserting, and so does focus leaving it. Always
 * reachable, whichever pieces of the workspace are switched off.
 */
export function createQuickSearch(editor: EditorController): QuickSearch {
  const root = document.createElement('div');
  root.className = 'quick-search';
  root.hidden = true;

  const search = createSearchCombobox(editor, {
    prefix: 'quick-search',
    placeholder: 'Search symbols by name',
    afterEnter: 'field',
    onInserted: () => close(false),
  });
  const { input } = search;
  input.setAttribute('aria-keyshortcuts', SEARCH_SHORTCUT_KEYS);

  const hint = document.createElement('p');
  hint.className = 'quick-search__hint';
  hint.textContent = 'Enter inserts · Esc closes';
  hint.setAttribute('aria-hidden', 'true');

  function close(toField: boolean): void {
    if (root.hidden) return;
    search.close();
    root.hidden = true;
    input.value = '';
    if (toField) editor.focus();
  }

  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' && event.key !== 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });

  // MathLive finishes focusing its field on a 60 ms timer, so a field
  // focused just before the box opened (Escape back to it, a click on it)
  // takes focus back a moment later. That is not the user leaving the box.
  let openedAt = -Infinity;
  root.addEventListener('focusout', (event: FocusEvent) => {
    const to = event.relatedTarget as Node | null;
    if (root.contains(to)) return;
    const toField = to instanceof Element && to.closest('math-field') !== null;
    if (toField && performance.now() - openedAt < FIELD_REFOCUS_GRACE_MS) {
      setTimeout(() => input.focus(), 0);
      return;
    }
    close(false);
  });

  root.append(search.label, input, hint, search.count, search.listbox, search.empty);

  return {
    root,
    open: () => {
      root.hidden = false;
      input.value = '';
      openedAt = performance.now();
      input.focus();
      root.scrollIntoView({ block: 'nearest' });
    },
    close,
    isOpen: () => !root.hidden,
  };
}

/**
 * Install the panel-wide `Ctrl+/` (`Cmd+/` on a Mac) shortcut: open the
 * quick search under the equation field from anywhere in the panel, or,
 * pressed again while it is open, close it and go back to the field.
 *
 * Matched on `key`, not `code`: `/` sits on different physical keys across
 * layouts, and neither Ctrl nor Cmd changes the character it produces (the
 * reason Alt+C and Alt+S match on `code` instead). Handled in the capture
 * phase so it reaches the shortcut even while focus is inside MathLive's
 * shadow root. Returns an unsubscribe function.
 */
export function installSymbolSearchShortcut(quick: Pick<QuickSearch, 'open' | 'close' | 'isOpen'>): () => void {
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== '/' || event.altKey || event.shiftKey) return;
    // Exactly one of the two: Ctrl+Cmd+/ is somebody else's shortcut.
    if (event.ctrlKey === event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (quick.isOpen()) quick.close(true);
    else quick.open();
  };
  document.addEventListener('keydown', onKeydown, { capture: true });
  return () => document.removeEventListener('keydown', onKeydown, { capture: true });
}
