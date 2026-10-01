/**
 * The My library workspace mode: the user's saved expressions as a list – not a
 * glyph grid – of [Insert][Edit] rows, one roving-tabindex Tab stop with
 * Left/Right inside a row and Up/Down between rows. Enter/Space on Insert
 * inserts at the caret without moving focus (consecutive inserts cost one
 * keypress, like the symbol grid); Edit opens the shared inline form,
 * pre-filled, with a confirm-then-delete control and an Undo that lasts
 * until the next library mutation.
 *
 * Previews are rendered LAZILY: `convertLatexToMarkup` runs only when a
 * row scrolls into view (IntersectionObserver), with a session cache – the
 * one measured jank hazard at thousands of entries is eagerly rendering
 * every preview. The name is always visible; the preview joins it when
 * ready.
 *
 * Every content change and filter or sort edit re-fills the one list from
 * rows cached per entry, so typing in the filter neither re-sorts, re-renders
 * names nor re-wires the keyboard handling. Focus that was inside the list
 * survives the swap: rows carry the entry id, and the same entry's button is
 * refocused afterwards. A use
 * count moving (an insert) does not rebuild at all – the "Recently used"
 * order catches up when the panel is next opened, so a run of inserts never
 * reorders the list under the user's hands.
 */
import { convertLatexToMarkup } from 'mathlive';
import type { EditorController } from './editor';
import { announce } from './a11y';
import { wireRovingTabindex } from './roving';
import { createLibraryForm } from './library-form';
import {
  getLibraryEntries,
  onLibraryChange,
  updateLibraryEntry,
  deleteLibraryEntry,
  restoreLibraryEntry,
  recordLibraryUse,
  isLibraryReadOnly,
  exportLibrary,
  parseLibraryFile,
  importLibraryEntries,
  addSeededEntries,
  removeSeededEntries,
  hasSeededEntries,
} from './library';
import type { LibraryEntry, ImportStrategy } from './library';
import { STARTER_PACK } from './library-starter';
import { hasNameMaths, renderName, spokenName } from './name-maths';
import { SAVE_SHORTCUT_LABEL } from './shortcut-labels';
import { triggerProblem } from './triggers';
import { categoriesOf, categoryKey } from './library-filter';
import type { CategoryOption } from './library-filter';

type SortOrder = 'used' | 'name' | 'added';
type RowButton = 'insert' | 'edit';

/**
 * Shown in the list, and announced, when the filter matches nothing. Names
 * the way out (clearing the filter) and what that shows.
 */
function noMatchText(total: number, categoryChosen: boolean): string {
  const what = categoryChosen ? 'filters' : 'filter';
  return total === 1
    ? `No formulae match – clear the ${what} to see your one formula`
    : `No formulae match – clear the ${what} to see all ${total}`;
}

/** "formula" or "formulae" for a count. */
function formulae(count: number): string {
  return `${count} formula${count === 1 ? '' : 'e'}`;
}

/** Session cache of rendered previews, keyed by body; shared with Custom shortcuts. */
const previewCache = new Map<string, string>();

export function renderPreview(target: HTMLElement, body: string): void {
  let markup = previewCache.get(body);
  if (markup === undefined) {
    try {
      markup = convertLatexToMarkup(body);
    } catch {
      markup = '';
    }
    previewCache.set(body, markup);
  }
  target.innerHTML = markup;
}

function sorted(entries: readonly LibraryEntry[], order: SortOrder): LibraryEntry[] {
  const copy = [...entries];
  switch (order) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    case 'added':
      return copy.sort((a, b) => b.created - a.created);
    case 'used':
    default:
      return copy.sort(
        (a, b) => (b.lastUsed ?? b.created) - (a.lastUsed ?? a.created),
      );
  }
}

export interface LibraryPanelOptions {
  /** Escape from the list; defaults to focusing the equation field. */
  onEscape?: () => void;
}

export interface LibraryPanel {
  element: HTMLElement;
  /**
   * Apply a "Recently used" reorder that was put off while the panel was in
   * use. Call when the panel comes back into view.
   */
  refresh: () => void;
}

export function buildLibraryPanel(
  editor: EditorController,
  options: LibraryPanelOptions = {},
): LibraryPanel {
  const onEscape = options.onEscape ?? ((): void => editor.focus());
  const panel = document.createElement('div');
  panel.className = 'library-panel';

  // ----------------------------------------------------------- header row
  const controls = document.createElement('div');
  controls.className = 'library-panel__controls';

  const filterLabel = document.createElement('label');
  filterLabel.className = 'visually-hidden';
  filterLabel.textContent = 'Filter library';
  filterLabel.htmlFor = 'library-filter';
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.id = 'library-filter';
  filter.className = 'library-panel__filter';
  filter.placeholder = 'Filter…';
  filter.autocomplete = 'off';

  const sortLabel = document.createElement('label');
  sortLabel.className = 'visually-hidden';
  sortLabel.textContent = 'Sort library';
  sortLabel.htmlFor = 'library-sort';
  const sort = document.createElement('select');
  sort.id = 'library-sort';
  sort.className = 'library-panel__sort';
  for (const [value, text] of [
    ['used', 'Recently used'],
    ['name', 'Name A–Z'],
    ['added', 'Recently added'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    sort.appendChild(option);
  }

  // Only offered once an entry has a category (from an import): a control
  // that can only ever say "All categories" is noise.
  const categoryLabel = document.createElement('label');
  categoryLabel.className = 'visually-hidden';
  categoryLabel.textContent = 'Category';
  categoryLabel.htmlFor = 'library-category';
  const categorySelect = document.createElement('select');
  categorySelect.id = 'library-category';
  categorySelect.className = 'library-panel__category';
  categorySelect.hidden = true;

  controls.append(filterLabel, filter, sortLabel, sort, categoryLabel, categorySelect);

  // A one-shot Undo for the last deletion; valid until the next mutation.
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'btn btn--secondary btn--slim';
  undoBtn.textContent = 'Undo delete';
  undoBtn.hidden = true;
  let deleted: LibraryEntry | null = null;
  let restoring = false;
  undoBtn.addEventListener('click', () => {
    if (deleted === null) return;
    const restored = deleted;
    restoring = true;
    try {
      restoreLibraryEntry(restored);
      announce(`Restored "${spokenName(restored.name)}"`);
    } finally {
      restoring = false;
    }
    deleted = null;
    // Hiding the focused button would drop focus to the page: move it to
    // the restored row first, or to the filter when that row is filtered out.
    if (!focusRow(restored.id, 'insert')) filter.focus();
    undoBtn.hidden = true;
  });

  // ------------------------------------------------------------- the list
  // One list element for the panel's lifetime: its roving-tabindex wiring is
  // created once and reads `buttons`, which every rebuild refills in place,
  // so rebuilding can never stack handlers.
  const listHost = document.createElement('div');
  listHost.className = 'library-panel__list-host';
  const list = document.createElement('div');
  list.className = 'library-panel__list';
  list.setAttribute('role', 'toolbar');
  list.setAttribute('aria-label', 'Library formulae');
  const buttons: HTMLButtonElement[] = [];
  const roving = wireRovingTabindex(list, buttons, {
    columns: () => 2,
    onEscape,
  });
  listHost.appendChild(list);

  const empty = document.createElement('p');
  empty.className = 'palette__empty';

  const formHost = document.createElement('div');
  formHost.className = 'library-panel__form';

  const lazyObserver =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((observations) => {
          for (const observation of observations) {
            if (!observation.isIntersecting) continue;
            const target = observation.target as HTMLElement;
            lazyObserver?.unobserve(target);
            renderPreview(target, target.dataset['body'] ?? '');
          }
        })
      : null;

  /** The buttons of every row on screen, by entry id; replaced per rebuild. */
  let rowButtons = new Map<string, Record<RowButton, HTMLButtonElement>>();

  const rowButton = (id: string, kind: RowButton): HTMLButtonElement | null =>
    rowButtons.get(id)?.[kind] ?? null;

  /**
   * Focus one row's button; the roving wiring's focus listener makes it the
   * list's Tab stop. False when that entry is not on screen.
   */
  const focusRow = (id: string, kind: RowButton): boolean => {
    const target = rowButton(id, kind);
    if (target === null) return false;
    target.focus();
    return document.activeElement === target;
  };

  const insertEntry = (entry: LibraryEntry, focusField: boolean): void => {
    editor.insert(entry.body, { focus: focusField });
    recordLibraryUse(entry.id);
    announce(`Inserted ${spokenName(entry.name)}`);
  };

  const closeForm = (focusTarget?: HTMLElement): void => {
    formHost.replaceChildren();
    if (focusTarget && focusTarget.isConnected) focusTarget.focus();
    else editor.focus();
  };

  const openEdit = (entry: LibraryEntry, editButton: HTMLButtonElement): void => {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn--danger';
    // The label names what is deleted in both states: the armed state is
    // what a screen reader hears after the first press.
    renderName(del, `Delete "${entry.name}"`);
    let armed = false;
    del.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        renderName(del, `Delete "${entry.name}" – press again`);
        announce(`Press again to delete "${spokenName(entry.name)}". Undo is available afterwards.`);
        return;
      }
      deleteLibraryEntry(entry.id);
      deleted = entry;
      renderName(undoBtn, `Undo delete of "${entry.name}"`);
      undoBtn.hidden = false;
      closeForm(undoBtn);
      announce(`Deleted "${spokenName(entry.name)}". An Undo button is available above the list.`);
    });

    formHost.replaceChildren(
      createLibraryForm({
        title: `Edit "${entry.name}"`,
        initial: {
          name: entry.name,
          body: entry.body,
          ...(entry.trigger !== undefined ? { trigger: entry.trigger } : {}),
          ...(entry.keywords !== undefined ? { keywords: entry.keywords } : {}),
          ...(entry.category !== undefined ? { category: entry.category } : {}),
        },
        excludeId: entry.id,
        submitLabel: 'Save changes',
        onSubmit: (fields) => {
          // Pass '' for cleared optionals so the store drops them.
          updateLibraryEntry(entry.id, {
            name: fields.name,
            body: fields.body,
            trigger: fields.trigger ?? '',
            keywords: fields.keywords ?? '',
            category: fields.category ?? '',
          });
          announce(`Saved changes to "${spokenName(fields.name)}"`);
        },
        // A save rebuilds the row, so the button is found again by entry id.
        onClose: () => closeForm(rowButton(entry.id, 'edit') ?? editButton),
        extraControls: [del],
      }),
    );
  };

  let currentFilter = '';
  let currentSort: SortOrder = 'used';
  /** Key of the chosen category; null shows every category. */
  let currentCategory: string | null = null;
  /** A use count moved while sorted by use: the order is out of date. */
  let orderStale = false;

  interface Row {
    entry: LibraryEntry;
    element: HTMLElement;
    insert: HTMLButtonElement;
    edit: HTMLButtonElement;
    /** Lower-cased text the filter matches against. */
    search: string;
    category: string | null;
  }

  /**
   * Rows are built once per entry object (the store replaces an entry's
   * object when it changes), so a keystroke re-renders no names and an edit
   * rebuilds only the row it touched.
   */
  const rowCache = new WeakMap<LibraryEntry, Row>();

  const rowFor = (entry: LibraryEntry, readOnly: boolean): Row => {
    const cached = rowCache.get(entry);
    if (cached) return cached;
    const row = document.createElement('div');
    row.className = 'library-row';
    row.dataset['id'] = entry.id;

    const insert = document.createElement('button');
    insert.type = 'button';
    insert.className = 'library-row__insert';
    insert.setAttribute('aria-label', spokenName(entry.name));
    // The rendered name speaks for itself; a tooltip would show words.
    if (!hasNameMaths(entry.name)) insert.title = entry.name;
    // Name over a one-line preview, the trigger at the right; the button's
    // accessible name stays the name, with any maths in it as words.
    const text = document.createElement('span');
    text.className = 'library-row__text';
    const name = document.createElement('span');
    name.className = 'library-row__name';
    renderName(name, entry.name);
    const preview = document.createElement('span');
    preview.className = 'library-row__preview';
    preview.setAttribute('aria-hidden', 'true');
    preview.dataset['body'] = entry.body;
    text.append(name, preview);
    insert.append(text);
    if (entry.trigger) {
      const trigger = document.createElement('span');
      trigger.className = 'library-row__trigger';
      trigger.setAttribute('aria-hidden', 'true');
      trigger.textContent = `\\${entry.trigger}`;
      insert.append(trigger);
    }
    insert.tabIndex = -1;
    insert.addEventListener('mousedown', (event) => event.preventDefault());
    insert.addEventListener('click', (event) => insertEntry(entry, event.detail !== 0));
    // Observed once: a row filtered out leaves the document and reports
    // again when it returns, so no preview is rendered while it is away.
    if (lazyObserver) lazyObserver.observe(preview);
    else renderPreview(preview, entry.body);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn--secondary btn--slim library-row__edit';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit "${spokenName(entry.name)}"`);
    edit.tabIndex = -1;
    edit.disabled = readOnly;
    edit.addEventListener('click', () => openEdit(entry, edit));

    row.append(insert, edit);
    const made: Row = {
      entry,
      element: row,
      insert,
      edit,
      search: `${entry.name} ${spokenName(entry.name)} ${entry.keywords ?? ''} ${entry.trigger ?? ''}`.toLowerCase(),
      category: categoryKey(entry),
    };
    rowCache.set(entry, made);
    return made;
  };

  /** What depends only on the stored entries and the sort order. */
  let derived: {
    all: readonly LibraryEntry[];
    order: SortOrder;
    ordered: LibraryEntry[];
    categories: CategoryOption[];
    seeded: boolean;
  } | null = null;
  let lastReadOnly: boolean | null = null;
  let categorySignature = '';

  /** Show the category control only when there is something to choose. */
  const syncCategories = (categories: CategoryOption[]): void => {
    const signature = categories.map((c) => `${c.key}\0${c.label}`).join('\n');
    if (currentCategory !== null && !categories.some((c) => c.key === currentCategory)) {
      currentCategory = null;
    }
    if (signature !== categorySignature) {
      categorySignature = signature;
      const all = document.createElement('option');
      all.value = '';
      all.textContent = 'All categories';
      categorySelect.replaceChildren(
        all,
        ...categories.map((c) => {
          const option = document.createElement('option');
          option.value = c.key;
          option.textContent = c.label;
          return option;
        }),
      );
    }
    categorySelect.value = currentCategory ?? '';
    const offered = categories.length > 0;
    if (!offered && categorySelect.contains(document.activeElement)) filter.focus();
    categorySelect.hidden = !offered;
    categoryLabel.hidden = !offered;
  };

  const rebuild = (): { shown: number; total: number } => {
    // Focus inside the list must land on the same entry after the swap.
    const active = document.activeElement;
    const focused =
      active instanceof HTMLButtonElement && listHost.contains(active)
        ? {
            id: active.closest<HTMLElement>('.library-row')?.dataset['id'],
            kind: (active.classList.contains('library-row__edit') ? 'edit' : 'insert') as RowButton,
          }
        : null;

    const readOnly = isLibraryReadOnly();
    const all = getLibraryEntries();
    if (derived === null || derived.all !== all || derived.order !== currentSort) {
      const same = derived?.all === all;
      derived = {
        all,
        order: currentSort,
        ordered: sorted(all, currentSort),
        categories: same ? derived!.categories : categoriesOf(all),
        seeded: same ? derived!.seeded : hasSeededEntries(),
      };
    }
    syncCategories(derived.categories);
    const needle = currentFilter.trim().toLowerCase();

    const shownRows: Row[] = [];
    for (const entry of derived.ordered) {
      const row = rowFor(entry, readOnly);
      if (lastReadOnly !== readOnly) row.edit.disabled = readOnly;
      if (needle !== '' && !row.search.includes(needle)) continue;
      if (currentCategory !== null && row.category !== currentCategory) continue;
      shownRows.push(row);
    }
    lastReadOnly = readOnly;

    buttons.length = 0;
    const nextRowButtons = new Map<string, Record<RowButton, HTMLButtonElement>>();
    for (const row of shownRows) {
      buttons.push(row.insert, row.edit);
      nextRowButtons.set(row.entry.id, { insert: row.insert, edit: row.edit });
    }
    list.replaceChildren(...shownRows.map((row) => row.element));
    roving.reset();

    if (shownRows.length === 0) {
      empty.textContent =
        all.length === 0
          ? 'Nothing in your library yet. Save the current equation with the ' +
            `"Save to library" button or ${SAVE_SHORTCUT_LABEL}, then insert the whole ` +
            'equation from here in one step.'
          : noMatchText(all.length, currentCategory !== null);
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }

    if (readOnly) {
      empty.hidden = false;
      empty.textContent =
        'This library was saved by a newer version of the extension, so it is ' +
        'read-only here. Formulae can still be inserted.';
    }

    importBtn.disabled = readOnly;
    starterBtn.disabled = readOnly;
    const seeded = derived.seeded;
    starterBtn.textContent = seeded ? 'Remove starter formulae' : 'Add starter formulae';
    starterHint.textContent = seeded
      ? 'Removing takes back only the starter formulae you have not edited'
      : "Quadratic formula, standard deviation, Maxwell's equations and more";
    rowButtons = nextRowButtons;
    orderStale = false;

    if (focused && !(focused.id !== undefined && focusRow(focused.id, focused.kind))) {
      // The focused entry left the list (deleted, or filtered out).
      if (buttons[0]) buttons[0].focus();
      else filter.focus();
    }
    return { shown: shownRows.length, total: all.length };
  };

  // ------------------------------------------------- portability tools
  const tools = document.createElement('div');
  tools.className = 'library-panel__tools';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn--secondary btn--slim';
  exportBtn.textContent = 'Export library';
  const doExport = (): void => {
    const blob = new Blob([exportLibrary()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'maths-editor-library.json';
    link.click();
    URL.revokeObjectURL(url);
    announce('Library exported as a JSON file');
  };
  exportBtn.addEventListener('click', doExport);

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn btn--secondary btn--slim';
  importBtn.textContent = 'Import library…';
  // Fully hidden (not just visually): only the Import… button opens it, so
  // it must be absent from the accessibility tree and every audit's sizing.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  // Belt and braces: hidden from every tree, but labelled anyway for any
  // audit or environment that still sees it.
  fileInput.setAttribute('aria-label', 'Import library file');
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // choosing the same file again must re-fire
    if (!file) return;
    void file.text().then((text) => {
      const imported = parseLibraryFile(text);
      if (imported === null || imported.length === 0) {
        announce('That file is not a maths editor library.', 'assertive');
        return;
      }
      openImportOptions(imported);
    });
  });

  // The starter pack: one toggle whose label follows the library state –
  // "Add starter formulae" or, while unedited seeded entries remain,
  // "Remove starter formulae" (an edited one is the user's and is never
  // taken back). Lives with the other whole-library tools. What the pack
  // holds, and the rule that removal keeps edited copies, sit in a visible
  // caption that also describes the button: a tooltip alone would never
  // reach keyboard or touch users.
  const starterBtn = document.createElement('button');
  starterBtn.type = 'button';
  starterBtn.className = 'btn btn--secondary btn--slim';
  const starterHint = document.createElement('span');
  starterHint.id = 'library-starter-hint';
  starterHint.className = 'field__hint library-panel__tools-hint';
  starterBtn.setAttribute('aria-describedby', starterHint.id);
  starterBtn.addEventListener('click', () => {
    if (hasSeededEntries()) {
      const removed = removeSeededEntries();
      announce(
        `Removed ${removed} starter formula${removed === 1 ? '' : 'e'}; ones you edited are kept`,
      );
    } else {
      const added = addSeededEntries(STARTER_PACK);
      announce(`Added ${added} starter formulae to your library`);
    }
  });
  tools.append(exportBtn, importBtn, starterBtn, fileInput, starterHint);

  /** The inline import disclosure: strategy radios + confirm. */
  const openImportOptions = (imported: LibraryEntry[]): void => {
    const form = document.createElement('form');
    form.className = 'library-form';
    const heading = document.createElement('h3');
    heading.className = 'library-form__title';
    heading.textContent = `Import ${formulae(imported.length)}`;

    const strategies: { value: ImportStrategy; label: string }[] = [
      { value: 'skip', label: 'Merge, skipping duplicates' },
      { value: 'keep-both', label: 'Merge, keeping both copies of duplicates' },
      { value: 'replace', label: 'Replace my library' },
    ];
    const radios = document.createElement('fieldset');
    radios.className = 'library-form__field';
    const legend = document.createElement('legend');
    legend.className = 'library-form__label';
    legend.textContent = 'How to handle what you already have';
    radios.appendChild(legend);
    strategies.forEach(({ value, label: text }, index) => {
      const row = document.createElement('label');
      row.className = 'library-form__radio';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'library-import-strategy';
      radio.value = value;
      radio.checked = index === 0;
      row.append(radio, document.createTextNode(` ${text}`));
      radios.appendChild(row);
    });

    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'btn btn--primary';
    confirm.textContent = 'Import formulae';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--secondary';
    cancel.textContent = 'Cancel';
    const exportFirst = document.createElement('button');
    exportFirst.type = 'button';
    exportFirst.className = 'btn btn--secondary';
    exportFirst.textContent = 'Export current library first';
    exportFirst.hidden = true;
    exportFirst.addEventListener('click', doExport);

    let replaceArmed = false;
    radios.addEventListener('change', () => {
      const strategy = (
        form.querySelector<HTMLInputElement>('input[name="library-import-strategy"]:checked')
      )?.value as ImportStrategy;
      exportFirst.hidden = strategy !== 'replace';
      replaceArmed = false;
      confirm.textContent = 'Import formulae';
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const strategy = (
        form.querySelector<HTMLInputElement>('input[name="library-import-strategy"]:checked')
      )?.value as ImportStrategy;
      // Replacing is destructive: a second, explicit press is required, and
      // the button and announcement both count what it removes.
      if (strategy === 'replace' && !replaceArmed) {
        replaceArmed = true;
        const current = formulae(getLibraryEntries().length);
        confirm.textContent = `Replace ${current} – press again`;
        announce(`Replacing removes all ${current} in your library. Press the button again to confirm.`);
        return;
      }
      // A trigger the Save form would refuse – a LaTeX command or a custom
      // shortcut's – is left off; the store handles its own entries' triggers.
      const result = importLibraryEntries(imported, strategy, (entry) => {
        const problem = entry.trigger === undefined ? null : triggerProblem(entry.trigger);
        return problem !== null && !problem.startsWith('A library formula');
      });
      closeForm(importBtn);
      const untriggered =
        result.untriggered === 0
          ? ''
          : result.untriggered === 1
            ? ' 1 came in without its trigger, which was already in use.'
            : ` ${result.untriggered} came in without their triggers, which were already in use.`;
      announce(
        (strategy === 'replace'
          ? `Replaced the library: ${formulae(result.added)} imported, ${result.removed} removed.`
          : `Imported ${formulae(result.added)}` +
            (result.skipped > 0
              ? `, skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}.`
              : '.')) + untriggered,
      );
    });
    cancel.addEventListener('click', () => closeForm(importBtn));
    form.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeForm(importBtn);
      }
    });

    const buttons = document.createElement('div');
    buttons.className = 'library-form__buttons';
    buttons.append(confirm, cancel, exportFirst);
    form.append(heading, radios, buttons);
    formHost.replaceChildren(form);
    queueMicrotask(() => form.querySelector('input')?.focus());
  };

  let countTimer: ReturnType<typeof setTimeout> | undefined;
  /** Re-filter, then speak the count once the user pauses. */
  const refilter = (): void => {
    const { shown, total } = rebuild();
    // Spoken once typing pauses, so a screen reader hears the final count
    // rather than one per keystroke.
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      if (filter.value !== currentFilter) return;
      announce(
        shown === 0
          ? noMatchText(total, currentCategory !== null)
          : `${shown} of ${formulae(total)}`,
      );
    }, 400);
  };
  filter.addEventListener('input', () => {
    currentFilter = filter.value;
    refilter();
  });
  categorySelect.addEventListener('change', () => {
    currentCategory = categorySelect.value === '' ? null : categorySelect.value;
    refilter();
  });
  sort.addEventListener('change', () => {
    currentSort = sort.value as SortOrder;
    rebuild();
  });
  onLibraryChange((_entries, kind) => {
    // Any mutation ends the undo window – except the restore itself.
    if (!restoring && deleted !== null) {
      deleted = null;
      undoBtn.hidden = true;
    }
    if (kind === 'usage') {
      // Only the "Recently used" order depends on a use count, and moving
      // the row now would pull the list out from under a run of inserts.
      if (currentSort === 'used') orderStale = true;
      return;
    }
    rebuild();
  });
  rebuild();

  panel.append(controls, undoBtn, formHost, empty, listHost, tools);
  return {
    element: panel,
    refresh: () => {
      if (orderStale) rebuild();
    },
  };
}
