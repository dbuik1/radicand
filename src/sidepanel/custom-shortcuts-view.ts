/**
 * The Custom shortcuts workspace mode: the user's own `\`-triggers as a list
 * of [Insert][Edit] rows – the trigger at the left, the name over the
 * rendered result and its LaTeX – with the same one-Tab-stop roving list as
 * My library. Add and Edit open a form in place of the list; Delete asks for
 * a second press and leaves an Undo until the next change.
 *
 * With no shortcuts yet the list is replaced by the three ways to get some
 * (add one, add the common set, import a file) and the common set itself,
 * grouped and rendered, so what that button adds is visible before it is
 * pressed.
 *
 * Every trigger the form or an import accepts is checked against the whole
 * `\`-trigger namespace (triggerProblem): a shortcut can never shadow a LaTeX
 * command or a My library trigger, and an import names the ones it skips.
 */
import type { EditorController } from './editor';
import { announce } from './a11y';
import { wireRovingTabindex } from './roving';
import { createLatexEditor, formField } from './library-form';
import { renderPreview } from './library-view';
import {
  addSeededShortcuts,
  addShortcut,
  areShortcutsReadOnly,
  deleteShortcut,
  exportShortcuts,
  freeTrigger,
  getShortcuts,
  hasSeededShortcuts,
  importShortcuts,
  onShortcutsChange,
  parseShortcutsFile,
  recordShortcutUse,
  removeSeededShortcuts,
  restoreShortcut,
  shortcutLabel,
  updateShortcut,
} from './shortcuts';
import type { NewShortcut, Shortcut } from './shortcuts';
import type { ImportStrategy } from './library';
import { COMMON_SHORTCUTS } from './shortcuts-common';
import { triggerProblem } from './triggers';

type RowButton = 'insert' | 'edit';

/** "1 shortcut", "3 shortcuts". */
function shortcuts(count: number): string {
  return `${count} shortcut${count === 1 ? '' : 's'}`;
}

function noMatchText(total: number): string {
  return total === 1
    ? 'No shortcuts match – clear the filter to see your one shortcut'
    : `No shortcuts match – clear the filter to see all ${total}`;
}

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The choice offered when a file uses the same trigger more than once:
 * keep every copy under a new trigger, or only the first.
 */
function repeatsField(fileName: string, repeated: readonly string[]): HTMLFieldSetElement {
  const field = document.createElement('fieldset');
  field.className = 'library-form__field';
  const legend = document.createElement('legend');
  legend.className = 'library-form__label';
  legend.textContent = 'Repeated triggers in the file';
  const hint = document.createElement('p');
  hint.className = 'field__hint';
  hint.id = 'shortcuts-import-repeats-hint';
  const one = repeated.length === 1;
  hint.textContent =
    `${listed(repeated.map((trigger) => `\\${trigger}`))} ` +
    `${one ? 'appears' : 'each appear'} more than once in ${fileName}.`;
  field.setAttribute('aria-describedby', hint.id);
  field.append(legend, hint);
  const choices = [
    { value: 'rename', label: 'Keep every copy, giving the extra copies new triggers' },
    { value: 'first', label: 'Keep only the first copy of each' },
  ];
  choices.forEach(({ value, label }, index) => {
    const row = document.createElement('label');
    row.className = 'library-form__radio';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'shortcuts-import-repeats';
    radio.value = value;
    radio.checked = index === 0;
    row.append(radio, document.createTextNode(` ${label}`));
    field.appendChild(row);
  });
  return field;
}

/**
 * Makes a file's triggers unique among themselves. The first copy of a
 * trigger keeps it; a later copy is dropped, or renamed clear of the
 * file's other triggers and of whatever `taken` claims.
 */
function resolveRepeats(
  entries: readonly Shortcut[],
  options: { keepAll: boolean; taken: (trigger: string) => boolean },
): { entries: Shortcut[]; dropped: number } {
  const inFile = new Set(entries.map((entry) => entry.trigger));
  const seen = new Set<string>();
  const kept: Shortcut[] = [];
  let dropped = 0;
  for (const entry of entries) {
    if (!seen.has(entry.trigger)) {
      seen.add(entry.trigger);
      kept.push(entry);
    } else if (!options.keepAll) {
      dropped++;
    } else {
      const trigger = freeTrigger(
        entry.trigger,
        (candidate) => inFile.has(candidate) || options.taken(candidate),
      );
      inFile.add(trigger);
      kept.push({ ...entry, trigger });
    }
  }
  return { entries: kept, dropped };
}

/** The trigger as typed in the form: a leading backslash is allowed. */
function cleanTrigger(value: string): string {
  return value.trim().replace(/^\\/, '');
}

function button(text: string, className = 'btn btn--secondary'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = text;
  return btn;
}

interface ShortcutFormOptions {
  heading: string;
  initial?: Shortcut;
  onSubmit: (fields: NewShortcut) => void;
  onClose: () => void;
  extraControls?: HTMLElement[];
}

/**
 * The add/edit form: Trigger (focused on mount), LaTeX with its preview,
 * Name and Keywords. A field's problem shows once that field has been
 * edited, or on an attempt to save – an empty new form opens clean. Enter
 * in a single-line field saves or, while there is a problem, moves focus to
 * it and reads it out; Escape cancels.
 */
function createShortcutForm(options: ShortcutFormOptions): HTMLFormElement {
  const initial = options.initial;
  const form = document.createElement('form');
  form.className = 'library-form';
  const heading = document.createElement('h3');
  heading.className = 'library-form__title';
  heading.id = 'shortcut-form-title';
  heading.textContent = options.heading;
  form.setAttribute('aria-labelledby', heading.id);

  const textInput = (value: string): HTMLInputElement => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field__control library-form__input';
    input.value = value;
    input.autocomplete = 'off';
    input.spellcheck = false;
    return input;
  };

  const triggerInput = textInput(initial?.trigger ?? '');
  const triggerError = document.createElement('p');
  triggerError.className = 'field__error';
  triggerError.setAttribute('role', 'status');
  const nameInput = textInput(initial?.name ?? '');
  const keywordsInput = textInput(initial?.keywords ?? '');

  let attempted = false;
  let triggerTouched = false;
  let latexTouched = initial !== undefined;

  const latex = createLatexEditor({
    initial: initial?.latex ?? '',
    emptyMessage: 'Enter the LaTeX this shortcut inserts.',
    onInput: () => {
      latexTouched = true;
      refresh();
    },
  });

  let firstProblem: { control: HTMLElement; message: string } | null = null;

  const refresh = (): boolean => {
    const trigger = cleanTrigger(triggerInput.value);
    let triggerIssue =
      trigger === '' ? 'Enter a trigger of two or more letters.' : triggerProblem(trigger, initial?.id);
    if (triggerIssue?.includes('already')) triggerIssue += ' Choose a different trigger.';
    const showTrigger = triggerIssue !== null && (attempted || triggerTouched);
    triggerError.textContent = showTrigger ? (triggerIssue ?? '') : '';
    triggerInput.setAttribute('aria-invalid', String(showTrigger));

    // The LaTeX box validates (and paints its own problem) only once it is
    // in play, so a fresh form does not open on an error.
    const latexValid = attempted || latexTouched ? latex.validate() : latex.value() !== '';
    firstProblem =
      triggerIssue !== null
        ? { control: triggerInput, message: triggerIssue }
        : !latexValid
          ? { control: latex.input, message: latex.problem() || 'Enter the LaTeX this shortcut inserts.' }
          : null;
    return firstProblem === null;
  };

  triggerInput.addEventListener('input', () => {
    triggerTouched = true;
    refresh();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    attempted = true;
    if (!refresh()) {
      if (firstProblem) {
        announce(firstProblem.message, 'assertive');
        firstProblem.control.focus();
      }
      return;
    }
    options.onSubmit({
      trigger: cleanTrigger(triggerInput.value),
      latex: latex.value(),
      name: nameInput.value.trim(),
      keywords: keywordsInput.value.trim(),
    });
  });
  form.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      options.onClose();
    }
  });

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn--primary';
  save.textContent = 'Save shortcut';
  const cancel = button('Cancel');
  cancel.addEventListener('click', () => options.onClose());
  const buttons = document.createElement('div');
  buttons.className = 'library-form__buttons';
  buttons.append(save, cancel, ...(options.extraControls ?? []));

  latex.field.appendChild(latex.preview);
  form.append(
    heading,
    formField('Trigger', triggerInput, triggerError),
    latex.field,
    formField('Name', nameInput),
    formField('Keywords', keywordsInput),
    buttons,
  );
  if (initial !== undefined) latex.validate();
  refresh();
  queueMicrotask(() => triggerInput.focus());
  return form;
}

/** The common set, grouped and rendered, as it will look once added. */
function buildCommonSet(): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'shortcuts-common';
  details.open = true;
  const summary = document.createElement('summary');
  summary.className = 'disclosure__summary';
  summary.textContent = 'What the common set adds';
  details.appendChild(summary);

  const groups = new Map<string, (typeof COMMON_SHORTCUTS)[number][]>();
  for (const entry of COMMON_SHORTCUTS) {
    groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  }
  for (const [group, entries] of groups) {
    const section = document.createElement('div');
    section.className = 'shortcuts-common__group';
    const title = document.createElement('p');
    title.className = 'shortcuts-common__name';
    title.id = `shortcuts-common-${group.toLowerCase().replaceAll(' ', '-')}`;
    title.textContent = group;
    const list = document.createElement('ul');
    list.className = 'shortcuts-common__list';
    list.setAttribute('aria-labelledby', title.id);
    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = 'shortcuts-common__item';
      const trigger = document.createElement('span');
      trigger.className = 'shortcuts-common__trigger';
      trigger.textContent = entry.trigger;
      const glyph = document.createElement('span');
      glyph.className = 'shortcuts-common__glyph';
      glyph.setAttribute('aria-hidden', 'true');
      renderPreview(glyph, entry.latex);
      const name = document.createElement('span');
      name.className = 'visually-hidden';
      name.textContent = `, ${entry.name ?? entry.latex}`;
      item.append(trigger, glyph, name);
      list.appendChild(item);
    }
    section.append(title, list);
    details.appendChild(section);
  }
  return details;
}

export interface CustomShortcutsPanel {
  element: HTMLElement;
  /** The mode's status line: the count, or what the form is doing. */
  status: HTMLElement;
  /** Land focus on the first control of whatever is showing. */
  focus: () => void;
  /** Leave any open form, so the mode reopens on the list. */
  reset: () => void;
}

export function buildCustomShortcutsPanel(
  editor: EditorController,
  options: { onEscape: () => void },
): CustomShortcutsPanel {
  const panel = document.createElement('div');
  panel.className = 'library-panel';
  const status = document.createElement('p');

  // ------------------------------------------------------------ list view
  const listView = document.createElement('div');
  listView.className = 'shortcuts-panel__list-view';

  const controls = document.createElement('div');
  controls.className = 'library-panel__controls';
  const filterLabel = document.createElement('label');
  filterLabel.className = 'visually-hidden';
  filterLabel.textContent = 'Filter shortcuts';
  filterLabel.htmlFor = 'shortcuts-filter';
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.id = 'shortcuts-filter';
  filter.className = 'library-panel__filter';
  filter.placeholder = 'Filter shortcuts';
  filter.autocomplete = 'off';
  const addBtn = button('Add shortcut');
  controls.append(filterLabel, filter, addBtn);

  const undoBtn = button('Undo delete', 'btn btn--secondary btn--slim');
  undoBtn.hidden = true;
  let deleted: Shortcut | null = null;
  let restoring = false;

  const message = document.createElement('p');
  message.className = 'palette__empty';
  const listHost = document.createElement('div');

  // Empty state: the three ways in, then the common set.
  const emptyView = document.createElement('div');
  emptyView.className = 'shortcuts-panel__empty';
  const emptyButtons = document.createElement('div');
  emptyButtons.className = 'library-form__buttons';
  const emptyAdd = button('Add shortcut');
  const emptyCommon = button(`Add ${COMMON_SHORTCUTS.length} common shortcuts`);
  const emptyImport = button('Import…');
  emptyButtons.append(emptyAdd, emptyCommon, emptyImport);
  emptyView.append(emptyButtons, buildCommonSet());

  const tools = document.createElement('div');
  tools.className = 'library-panel__tools';
  const exportBtn = button('Export shortcuts', 'btn btn--secondary btn--slim');
  const importBtn = button('Import…', 'btn btn--secondary btn--slim');
  const commonBtn = button('Add common shortcuts', 'btn btn--secondary btn--slim');
  // Fully hidden: only the Import… buttons open it.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  fileInput.setAttribute('aria-label', 'Import shortcuts file');
  tools.append(exportBtn, importBtn, commonBtn, fileInput);

  listView.append(controls, undoBtn, message, listHost, emptyView, tools);

  // ------------------------------------------------------------ form view
  const formHost = document.createElement('div');
  formHost.hidden = true;
  panel.append(listView, formHost);

  /** Where focus returns when the open form closes. */
  let formOpener: HTMLElement | null = null;
  let formStatus = '';

  const syncStatus = (): void => {
    const count = getShortcuts().length;
    status.textContent =
      formStatus !== '' ? formStatus : count === 0 ? 'No shortcuts yet' : shortcuts(count);
  };

  let rowButtons = new Map<string, Record<RowButton, HTMLButtonElement>>();
  const focusRow = (id: string, kind: RowButton): boolean => {
    const target = rowButtons.get(id)?.[kind];
    if (!target) return false;
    target.focus();
    return document.activeElement === target;
  };

  const showForm = (form: HTMLElement, statusText: string, opener: HTMLElement | null): void => {
    formOpener = opener;
    formStatus = statusText;
    formHost.replaceChildren(form);
    formHost.hidden = false;
    listView.hidden = true;
    syncStatus();
  };

  /** Back to the list; `focusTarget` wins over the control that opened the form. */
  const closeForm = (focusTarget?: HTMLElement | null): void => {
    if (formHost.hidden) return;
    formHost.replaceChildren();
    formHost.hidden = true;
    listView.hidden = false;
    formStatus = '';
    syncStatus();
    const target = focusTarget ?? formOpener;
    formOpener = null;
    if (target?.isConnected && !target.closest('[hidden]')) target.focus();
    else focusFirst();
  };

  const focusFirst = (): void => {
    if (!formHost.hidden) {
      formHost.querySelector<HTMLElement>('input')?.focus();
    } else if (!emptyView.hidden) {
      emptyAdd.focus();
    } else {
      filter.focus();
    }
  };

  const openAdd = (opener: HTMLElement): void => {
    showForm(
      createShortcutForm({
        heading: 'Add shortcut',
        onSubmit: (fields) => {
          const added = addShortcut(fields);
          closeForm(rowButtons.get(added.id)?.insert ?? null);
          announce(`Added \\${added.trigger}`);
        },
        onClose: () => closeForm(),
      }),
      'Adding a shortcut',
      opener,
    );
  };

  const openEdit = (shortcut: Shortcut, opener: HTMLElement): void => {
    const del = button('Delete', 'btn btn--danger');
    del.setAttribute('aria-label', `Delete \\${shortcut.trigger}`);
    let armed = false;
    del.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        del.textContent = 'Delete – press again';
        del.setAttribute('aria-label', `Delete \\${shortcut.trigger} – press again`);
        announce(`Press again to delete \\${shortcut.trigger}. Undo is available afterwards.`);
        return;
      }
      deleteShortcut(shortcut.id);
      deleted = shortcut;
      undoBtn.textContent = `Undo delete of ${shortcut.trigger}`;
      undoBtn.hidden = false;
      closeForm(undoBtn);
      announce(`Deleted \\${shortcut.trigger}. An Undo button is available above the list.`);
    });
    showForm(
      createShortcutForm({
        heading: 'Edit shortcut',
        initial: shortcut,
        onSubmit: (fields) => {
          updateShortcut(shortcut.id, fields);
          closeForm(rowButtons.get(shortcut.id)?.edit ?? null);
          announce(`Saved \\${fields.trigger}`);
        },
        onClose: () => closeForm(rowButtons.get(shortcut.id)?.edit ?? null),
        extraControls: [del],
      }),
      `Editing ${shortcut.trigger}`,
      opener,
    );
  };

  const insertShortcut = (shortcut: Shortcut, focusField: boolean): void => {
    editor.insert(shortcut.latex, { focus: focusField });
    recordShortcutUse(shortcut.id);
    announce(`Inserted ${shortcutLabel(shortcut)}`);
  };

  let currentFilter = '';

  const rebuild = (): { shown: number; total: number } => {
    const active = document.activeElement;
    const focused =
      active instanceof HTMLButtonElement && listHost.contains(active)
        ? {
            id: active.closest<HTMLElement>('.library-row')?.dataset['id'],
            kind: (active.classList.contains('library-row__edit') ? 'edit' : 'insert') as RowButton,
          }
        : null;

    const readOnly = areShortcutsReadOnly();
    const all = getShortcuts();
    const needle = currentFilter.trim().toLowerCase();
    const shown = [...all]
      .filter(
        (s) =>
          needle === '' ||
          `${s.trigger} ${s.name ?? ''} ${s.keywords ?? ''} ${s.latex}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.trigger.localeCompare(b.trigger, 'en', { sensitivity: 'base' }) ||
        a.trigger.localeCompare(b.trigger, 'en'));

    const list = document.createElement('div');
    list.className = 'library-panel__list';
    list.setAttribute('role', 'toolbar');
    list.setAttribute('aria-label', 'Your shortcuts');
    const buttons: HTMLButtonElement[] = [];
    const next = new Map<string, Record<RowButton, HTMLButtonElement>>();
    for (const shortcut of shown) {
      const row = document.createElement('div');
      row.className = 'library-row';
      row.dataset['id'] = shortcut.id;

      const insert = document.createElement('button');
      insert.type = 'button';
      insert.className = 'library-row__insert';
      insert.setAttribute(
        'aria-label',
        `${shortcut.trigger}, inserts ${shortcut.latex}${shortcut.name ? `, ${shortcut.name}` : ''}`,
      );
      const trigger = document.createElement('span');
      trigger.className = 'shortcut-row__trigger';
      trigger.setAttribute('aria-hidden', 'true');
      trigger.textContent = shortcut.trigger;
      const text = document.createElement('span');
      text.className = 'library-row__text';
      text.setAttribute('aria-hidden', 'true');
      if (shortcut.name) {
        const name = document.createElement('span');
        name.className = 'library-row__name';
        name.textContent = shortcut.name;
        text.appendChild(name);
      }
      const preview = document.createElement('span');
      preview.className = 'library-row__preview shortcut-row__preview';
      const glyph = document.createElement('span');
      glyph.className = 'shortcut-row__glyph';
      renderPreview(glyph, shortcut.latex);
      const code = document.createElement('code');
      code.className = 'shortcut-row__code';
      code.textContent = shortcut.latex;
      preview.append(glyph, code);
      text.appendChild(preview);
      insert.append(trigger, text);
      insert.tabIndex = buttons.length === 0 ? 0 : -1;
      insert.addEventListener('mousedown', (event) => event.preventDefault());
      insert.addEventListener('click', (event) => insertShortcut(shortcut, event.detail !== 0));

      const edit = button('Edit', 'btn btn--secondary btn--slim library-row__edit');
      edit.setAttribute('aria-label', `Edit ${shortcut.trigger}`);
      edit.tabIndex = -1;
      edit.disabled = readOnly;
      edit.addEventListener('click', () => openEdit(shortcut, edit));

      buttons.push(insert, edit);
      next.set(shortcut.id, { insert, edit });
      row.append(insert, edit);
      list.appendChild(row);
    }
    rowButtons = next;

    const isEmpty = all.length === 0;
    emptyView.hidden = !isEmpty || readOnly;
    controls.hidden = isEmpty;
    tools.hidden = isEmpty;
    if (shown.length > 0) {
      wireRovingTabindex(list, buttons, { columns: () => 2, onEscape: options.onEscape });
      listHost.replaceChildren(list);
    } else {
      listHost.replaceChildren();
    }

    message.hidden = true;
    if (readOnly) {
      message.hidden = false;
      message.textContent =
        'These shortcuts were saved by a newer version of the extension, so they are ' +
        'read-only here. They can still be inserted.';
    } else if (!isEmpty && shown.length === 0) {
      message.hidden = false;
      message.textContent = noMatchText(all.length);
    }

    for (const control of [addBtn, importBtn, commonBtn, emptyAdd, emptyCommon, emptyImport]) {
      control.disabled = readOnly;
    }
    commonBtn.textContent = hasSeededShortcuts() ? 'Remove common shortcuts' : 'Add common shortcuts';
    syncStatus();

    if (focused) {
      if (!(focused.id !== undefined && focusRow(focused.id, focused.kind))) {
        if (buttons[0]) buttons[0].focus();
        else focusFirst();
      }
    }
    return { shown: shown.length, total: all.length };
  };

  // --------------------------------------------------------- common set
  const addCommon = (): number => {
    // Library triggers and anything MathLive now treats as a command are
    // left out, so the set can never shadow either.
    const usable = COMMON_SHORTCUTS.filter((entry) => {
      const problem = triggerProblem(entry.trigger);
      return problem === null || problem.startsWith('A custom shortcut');
    });
    const added = addSeededShortcuts(usable);
    announce(
      added === 0
        ? 'The common shortcuts are already in your list'
        : `Added ${shortcuts(added)}`,
    );
    return added;
  };
  emptyCommon.addEventListener('click', () => {
    addCommon();
    focusFirst();
  });
  commonBtn.addEventListener('click', () => {
    if (hasSeededShortcuts()) {
      const removed = removeSeededShortcuts();
      announce(`Removed ${shortcuts(removed)}; ones you edited are kept`);
      // With nothing left the button is gone: land on the empty state.
      if (commonBtn.closest('[hidden]')) focusFirst();
    } else {
      addCommon();
    }
  });

  // ------------------------------------------------------ export / import
  const doExport = (): void => {
    const blob = new Blob([exportShortcuts()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'maths-editor-shortcuts.json';
    link.click();
    URL.revokeObjectURL(url);
    announce('Shortcuts exported as a JSON file');
  };
  exportBtn.addEventListener('click', doExport);

  let importOpener: HTMLElement = importBtn;
  for (const opener of [importBtn, emptyImport]) {
    opener.addEventListener('click', () => {
      importOpener = opener;
      fileInput.click();
    });
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // choosing the same file again must re-fire
    if (!file) return;
    void file.text().then((text) => {
      const imported = parseShortcutsFile(text);
      if (imported === null || imported.length === 0) {
        announce('That file is not a maths editor shortcuts file.', 'assertive');
        return;
      }
      openImport(file.name, imported);
    });
  });

  const openImport = (fileName: string, imported: Shortcut[]): void => {
    // A trigger that is a LaTeX command or a My library trigger is never
    // imported: the form would refuse it, so the file cannot sneak it in.
    // A copy renamed on import must avoid them too.
    const unavailable = (trigger: string): boolean => {
      const problem = triggerProblem(trigger);
      return problem !== null && !problem.startsWith('A custom shortcut');
    };
    const blocked: Shortcut[] = [];
    const accepted: Shortcut[] = [];
    for (const entry of imported) {
      if (unavailable(entry.trigger)) blocked.push(entry);
      else accepted.push(entry);
    }
    const own = new Set(getShortcuts().map((s) => s.trigger));
    const clashing = accepted.filter((entry) => own.has(entry.trigger)).length;
    const counts = new Map<string, number>();
    for (const entry of accepted) counts.set(entry.trigger, (counts.get(entry.trigger) ?? 0) + 1);
    const repeated = [...counts].filter(([, count]) => count > 1).map(([trigger]) => trigger);

    const form = document.createElement('form');
    form.className = 'library-form';
    const heading = document.createElement('h3');
    heading.className = 'library-form__title';
    heading.id = 'shortcuts-import-title';
    heading.textContent = 'Import shortcuts';
    form.setAttribute('aria-labelledby', heading.id);

    const summary = document.createElement('p');
    summary.className = 'shortcuts-import__summary';
    summary.textContent =
      `${fileName} holds ${shortcuts(imported.length)}.` +
      (clashing > 0
        ? ` ${clashing} ${clashing === 1 ? 'uses a trigger' : 'use triggers'} you already have.`
        : '');

    const radios = document.createElement('fieldset');
    radios.className = 'library-form__field';
    const legend = document.createElement('legend');
    legend.className = 'library-form__label';
    legend.textContent = 'How to handle what you already have';
    radios.appendChild(legend);
    const strategies: { value: ImportStrategy; label: string }[] = [
      { value: 'skip', label: 'Skip duplicates (same trigger)' },
      { value: 'keep-both', label: 'Merge, keeping both copies of duplicates' },
      { value: 'replace', label: 'Replace my shortcuts' },
    ];
    strategies.forEach(({ value, label }, index) => {
      const row = document.createElement('label');
      row.className = 'library-form__radio';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'shortcuts-import-strategy';
      radio.value = value;
      radio.checked = index === 0;
      row.append(radio, document.createTextNode(` ${label}`));
      radios.appendChild(row);
    });

    const parts: HTMLElement[] = [heading, summary, radios];
    if (repeated.length > 0) parts.push(repeatsField(fileName, repeated));
    if (blocked.length > 0) {
      const inLibrary = blocked
        .filter((entry) => triggerProblem(entry.trigger)?.startsWith('A library'))
        .map((entry) => entry.trigger);
      const commands = blocked
        .filter((entry) => !inLibrary.includes(entry.trigger))
        .map((entry) => entry.trigger);
      const note = document.createElement('p');
      note.className = 'field__hint';
      const sentences: string[] = [];
      if (inLibrary.length > 0) {
        const one = inLibrary.length === 1;
        sentences.push(
          `${listed(inLibrary)} ${one ? 'is also a trigger' : 'are also triggers'} in My library, ` +
            `so ${one ? 'it' : 'they'} will be skipped. Change ${one ? 'it' : 'them'} there to import ${one ? 'it' : 'them'}.`,
        );
      }
      if (commands.length > 0) {
        const one = commands.length === 1;
        sentences.push(
          `${listed(commands.map((t) => `\\${t}`))} ${one ? 'is a LaTeX command' : 'are LaTeX commands'}, ` +
            `so ${one ? 'it' : 'they'} will be skipped.`,
        );
      }
      note.textContent = sentences.join(' ');
      parts.push(note);
    }

    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'btn btn--primary';
    confirm.textContent = 'Import shortcuts';
    const cancel = button('Cancel');
    const exportFirst = button('Export current shortcuts first');
    exportFirst.hidden = true;
    exportFirst.addEventListener('click', doExport);

    const chosen = (): ImportStrategy =>
      (form.querySelector<HTMLInputElement>('input[name="shortcuts-import-strategy"]:checked')
        ?.value ?? 'skip') as ImportStrategy;
    let replaceArmed = false;
    radios.addEventListener('change', () => {
      exportFirst.hidden = chosen() !== 'replace' || getShortcuts().length === 0;
      replaceArmed = false;
      confirm.textContent = 'Import shortcuts';
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const strategy = chosen();
      const current = getShortcuts().length;
      if (strategy === 'replace' && current > 0 && !replaceArmed) {
        replaceArmed = true;
        confirm.textContent = `Replace ${shortcuts(current)} – press again`;
        announce(
          `Replacing removes all ${shortcuts(current)} in your list. Press the button again to confirm.`,
        );
        return;
      }
      const keepAll =
        form.querySelector<HTMLInputElement>('input[name="shortcuts-import-repeats"]:checked')
          ?.value !== 'first';
      const { entries, dropped } = resolveRepeats(accepted, {
        keepAll,
        taken: (trigger) =>
          (strategy !== 'replace' && own.has(trigger)) || unavailable(trigger),
      });
      const result = importShortcuts(entries, strategy, (candidate) =>
        unavailable(candidate.trigger),
      );
      const skipped = result.skipped + blocked.length + dropped;
      // Back to the Import… button that was used, or, when the import
      // emptied or filled the list and hid it, the first control shown.
      closeForm();
      announce(
        (strategy === 'replace'
          ? `Replaced your shortcuts: ${shortcuts(result.added)} imported, ${result.removed} removed`
          : `Imported ${shortcuts(result.added)}`) +
          (skipped > 0 ? `, skipped ${skipped}.` : '.'),
      );
    });
    cancel.addEventListener('click', () => closeForm());
    form.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeForm();
      }
    });

    const buttons = document.createElement('div');
    buttons.className = 'library-form__buttons';
    buttons.append(confirm, cancel, exportFirst);
    form.append(...parts, buttons);
    showForm(form, `Importing ${fileName}`, importOpener);
    queueMicrotask(() => form.querySelector('input')?.focus());
  };

  // ------------------------------------------------------------- wiring
  undoBtn.addEventListener('click', () => {
    if (deleted === null) return;
    const restored = deleted;
    restoring = true;
    try {
      restoreShortcut(restored);
      announce(`Restored \\${restored.trigger}`);
    } finally {
      restoring = false;
    }
    deleted = null;
    if (!focusRow(restored.id, 'insert')) filter.focus();
    undoBtn.hidden = true;
  });

  addBtn.addEventListener('click', () => openAdd(addBtn));
  emptyAdd.addEventListener('click', () => openAdd(emptyAdd));

  let countTimer: ReturnType<typeof setTimeout> | undefined;
  filter.addEventListener('input', () => {
    currentFilter = filter.value;
    const { shown, total } = rebuild();
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      if (filter.value !== currentFilter) return;
      announce(shown === 0 ? noMatchText(total) : `${shown} of ${shortcuts(total)}`);
    }, 400);
  });

  onShortcutsChange((_entries, kind) => {
    if (kind === 'usage') return;
    if (!restoring && deleted !== null) {
      deleted = null;
      undoBtn.hidden = true;
    }
    rebuild();
  });
  rebuild();

  return {
    element: panel,
    status,
    focus: focusFirst,
    reset: () => {
      formHost.replaceChildren();
      formHost.hidden = true;
      listView.hidden = false;
      formOpener = null;
      formStatus = '';
      syncStatus();
    },
  };
}
