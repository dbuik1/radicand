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
 * The list is rebuilt from scratch on every content change and filter or
 * sort edit. Focus that was inside the list survives the swap: rows carry
 * the entry id, and the same entry's button is refocused afterwards. A use
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

type SortOrder = 'used' | 'name' | 'added';
type RowButton = 'insert' | 'edit';

/**
 * Shown in the list, and announced, when the filter matches nothing. Names
 * the way out (clearing the filter) and what that shows.
 */
function noMatchText(total: number): string {
  return total === 1
    ? 'No formulae match – clear the filter to see your one formula'
    : `No formulae match – clear the filter to see all ${total}`;
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

  controls.append(filterLabel, filter, sortLabel, sort);

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
  // A NEW list element is built per rebuild (and swapped into this host),
  // so the roving-tabindex keydown wiring is created exactly once per list
  // and dies with it – rebuilding can never stack handlers (same pattern
  // as the palette's buildGrid).
  const listHost = document.createElement('div');
  listHost.className = 'library-panel__list-host';

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
  /** A use count moved while sorted by use: the order is out of date. */
  let orderStale = false;

  const rebuild = (): { shown: number; total: number } => {
    // Every observed preview is about to be discarded with its row.
    lazyObserver?.disconnect();
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
    const needle = currentFilter.trim().toLowerCase();
    const shown = sorted(
      needle === ''
        ? all
        : all.filter((entry) =>
            `${entry.name} ${spokenName(entry.name)} ${entry.keywords ?? ''} ${entry.trigger ?? ''}`
              .toLowerCase()
              .includes(needle),
          ),
      currentSort,
    );

    const list = document.createElement('div');
    list.className = 'library-panel__list';
    list.setAttribute('role', 'toolbar');
    list.setAttribute('aria-label', 'Library formulae');
    const buttons: HTMLButtonElement[] = [];
    const nextRowButtons = new Map<string, Record<RowButton, HTMLButtonElement>>();
    shown.forEach((entry) => {
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
      insert.tabIndex = buttons.length === 0 ? 0 : -1;
      insert.addEventListener('mousedown', (event) => event.preventDefault());
      insert.addEventListener('click', (event) => insertEntry(entry, event.detail !== 0));
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

      buttons.push(insert, edit);
      nextRowButtons.set(entry.id, { insert, edit });
      row.append(insert, edit);
      list.appendChild(row);
    });

    if (shown.length === 0) {
      empty.textContent =
        all.length === 0
          ? 'Nothing in your library yet. Save the current equation with the ' +
            `"Save to library" button or ${SAVE_SHORTCUT_LABEL}, then insert the whole ` +
            'equation from here in one step.'
          : noMatchText(all.length);
      empty.hidden = false;
    } else {
      empty.hidden = true;
      wireRovingTabindex(list, buttons, {
        columns: () => 2,
        onEscape,
      });
    }

    if (readOnly) {
      empty.hidden = false;
      empty.textContent =
        'This library was saved by a newer version of the extension, so it is ' +
        'read-only here. Formulae can still be inserted.';
    }

    importBtn.disabled = readOnly;
    starterBtn.disabled = readOnly;
    const seeded = hasSeededEntries();
    starterBtn.textContent = seeded ? 'Remove starter formulae' : 'Add starter formulae';
    starterHint.textContent = seeded
      ? 'Removing takes back only the starter formulae you have not edited'
      : "Quadratic formula, standard deviation, Maxwell's equations and more";
    rowButtons = nextRowButtons;
    listHost.replaceChildren(list);
    orderStale = false;

    if (focused && !(focused.id !== undefined && focusRow(focused.id, focused.kind))) {
      // The focused entry left the list (deleted, or filtered out).
      if (buttons[0]) buttons[0].focus();
      else filter.focus();
    }
    return { shown: shown.length, total: all.length };
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
  filter.addEventListener('input', () => {
    currentFilter = filter.value;
    const { shown, total } = rebuild();
    // Spoken once typing pauses, so a screen reader hears the final count
    // rather than one per keystroke.
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      if (filter.value !== currentFilter) return;
      announce(
        shown === 0 ? noMatchText(total) : `${shown} of ${formulae(total)}`,
      );
    }, 400);
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
