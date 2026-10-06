/**
 * The shared inline form for authoring a library entry – used by the
 * capture flow ("Save to library" / Alt+S) and by My library's Edit.
 * An inline disclosure, not a modal: the panel's established pattern – it
 * traps no focus and dims nothing.
 *
 * Fields: Name (focused on mount), the LaTeX body (with a "Blank out
 * selection" control that turns the selected part of the body text into a
 * `\placeholder{}` slot – template authoring without new syntax), Trigger,
 * Keywords, Category, a read-only live preview, and Save/Cancel. `#?` typed in the
 * body is normalised to `\placeholder{}` on save; `validateLatex` errors
 * surface inline as you type, described to their field, and block saving,
 * so a body that would render as an error atom is never stored. Enter in a
 * single-line field saves – or, while a field has a problem, moves focus to
 * that field and announces the problem; Escape anywhere cancels.
 */
import { convertLatexToMarkup, validateLatex } from 'mathlive';
import type { LatexSyntaxError, ParserErrorCode } from 'mathlive';
import { announce } from './a11y';
import { getLibraryEntries } from './library';
import { categoriesOf } from './library-filter';
import { hasNameMaths, renderName } from './name-maths';
import type { NewLibraryEntry } from './library';
import { triggerProblem } from './triggers';

export interface LibraryFormOptions {
  /** Heading shown above the fields. */
  /** Heading above the fields; omitted when the host shows its own title. */
  title?: string;
  /**
   * Fold LaTeX, Trigger, Keywords and Category behind a "More options" disclosure so
   * the quick path is Name then Enter (the capture form). The disclosure
   * opens itself when one of those fields has a problem to show.
   */
  moreOptions?: boolean;
  initial: Partial<NewLibraryEntry>;
  /** Entry id being edited, so its own trigger does not self-collide. */
  excludeId?: string;
  submitLabel: string;
  /** Called with validated, normalised fields. */
  onSubmit: (fields: NewLibraryEntry) => void;
  /** Called on Cancel/Escape, and after a successful submit. */
  onClose: () => void;
  /** Extra controls appended to the button row (e.g. Edit's Delete). */
  extraControls?: HTMLElement[];
}

/** Normalise a body for storage: `#?` becomes a real placeholder. */
function normaliseBody(body: string): string {
  return body.replaceAll('#?', '\\placeholder{}').trim();
}

/**
 * What each MathLive parser code means for the person typing the LaTeX:
 * one plain sentence naming their fix, quoting the offending command where
 * MathLive supplies it. `arg` already carries the backslash for commands.
 */
const PROBLEM_TEXT: Record<ParserErrorCode, (arg?: string) => string> = {
  'unknown-command': (arg) => `${arg ?? 'This command'} is not a LaTeX command`,
  'invalid-command': (arg) => `${arg ?? 'This command'} cannot be used here`,
  'unbalanced-braces': () => 'Every { needs a matching }',
  'unknown-environment': (arg) =>
    arg ? `${arg} is not a LaTeX environment` : 'This is not a LaTeX environment',
  'unbalanced-environment': (arg) =>
    arg ? `\\begin{${arg}} needs a matching \\end{${arg}}` : 'Every \\begin needs a matching \\end',
  'unbalanced-mode-shift': () => 'Every $ or \\( needs its closing $ or \\)',
  'missing-argument': (arg) => `${arg ?? 'This command'} needs an argument in { }`,
  'too-many-infix-commands': () => 'Use only one \\over, \\atop or \\choose in a group',
  'unexpected-command-in-string': (arg) => `${arg ?? 'A command'} cannot be used inside text`,
  'missing-unit': () => 'A size needs a unit, such as 2pt or 1em',
  'unexpected-delimiter': (arg) => `${arg ?? 'This'} cannot be used as a delimiter here`,
  'unexpected-token': (arg) => `${arg ?? 'This'} cannot be used here`,
  'unexpected-end-of-string': () => 'The LaTeX ends before a { or \\left is closed',
  'improper-alphabetic-constant': () => 'A letter cannot be used as a constant here',
};

/** The inline error for a body that does not render, in the user's terms. */
export function latexProblemText(problems: readonly LatexSyntaxError[]): string {
  const sentences = problems.map((problem) => {
    const describe = PROBLEM_TEXT[problem.code];
    return describe ? describe(problem.arg) : 'This LaTeX cannot be rendered';
  });
  return [...new Set(sentences)].map((sentence) => `${sentence}.`).join(' ');
}

// Unique ids across forms (capture and edit can exist in the same panel).
let fieldIdCounter = 0;

export function formField(
  labelText: string,
  input: HTMLInputElement | HTMLTextAreaElement,
  hint?: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'library-form__field';
  const label = document.createElement('label');
  label.className = 'library-form__label';
  label.textContent = labelText;
  const id = `library-field-${fieldIdCounter++}`;
  input.id = id;
  label.htmlFor = id;
  wrap.append(label, input);
  if (hint) {
    // The hint or error is part of the field's description, so a screen
    // reader reads it on arrival at the field, not only when it changes.
    hint.id = `${id}-hint`;
    input.setAttribute('aria-describedby', hint.id);
    wrap.appendChild(hint);
  }
  return wrap;
}

export interface LatexEditor {
  /** The labelled field: textarea, its error line and "Blank out selection". */
  field: HTMLElement;
  input: HTMLTextAreaElement;
  /** The rendered preview; the host places it. */
  preview: HTMLElement;
  /** Re-validate and re-render when the LaTeX changed; true when it renders. */
  validate: () => boolean;
  /** The current problem, or '' when there is none. */
  problem: () => string;
  /** The LaTeX as it would be stored. */
  value: () => string;
}

/**
 * The LaTeX box both forms share: a monospace textarea, a "Blank out
 * selection" control that turns the selected text into a Tab-navigable
 * `\placeholder{}` slot, an inline problem line described to the field, and
 * a rendered preview. Validating and rendering is the costly part of a
 * form refresh, so it re-runs only when the LaTeX itself changed.
 */
export function createLatexEditor(options: {
  initial: string;
  /** What the problem line says while the box is empty. */
  emptyMessage: string;
  /** Called on every edit, including a blank-out. */
  onInput: () => void;
}): LatexEditor {
  const input = document.createElement('textarea');
  input.className = 'field__control library-form__body';
  input.rows = 3;
  input.value = options.initial;
  input.spellcheck = false;

  const error = document.createElement('p');
  error.className = 'field__error';
  error.setAttribute('role', 'status');

  const preview = document.createElement('div');
  preview.className = 'library-form__preview';
  preview.setAttribute('aria-hidden', 'true');

  let lastBody: string | null = null;
  let valid = true;

  const blankOut = document.createElement('button');
  blankOut.type = 'button';
  blankOut.className = 'btn btn--secondary btn--slim';
  blankOut.textContent = 'Blank out selection';
  blankOut.title = 'Turns the selection into a Tab-navigable slot';
  blankOut.addEventListener('click', () => {
    const { selectionStart, selectionEnd } = input;
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) {
      error.textContent = 'Select part of the LaTeX first, then blank it out.';
      lastBody = null; // the next validation must put its own text back
      input.focus();
      return;
    }
    const before = input.value.slice(0, selectionStart);
    const after = input.value.slice(selectionEnd);
    input.value = `${before}\\placeholder{}${after}`;
    const caret = before.length + '\\placeholder{}'.length;
    input.setSelectionRange(caret, caret);
    input.focus();
    options.onInput();
  });

  const validate = (): boolean => {
    const body = normaliseBody(input.value);
    if (body !== lastBody) {
      lastBody = body;
      valid = true;
      if (body === '') {
        error.textContent = options.emptyMessage;
        preview.replaceChildren();
        valid = false;
      } else {
        const problems = validateLatex(body);
        if (problems.length > 0) {
          error.textContent = latexProblemText(problems);
          valid = false;
        } else {
          error.textContent = '';
        }
        try {
          preview.innerHTML = convertLatexToMarkup(body);
        } catch {
          preview.replaceChildren();
        }
      }
    }
    input.setAttribute('aria-invalid', String(!valid));
    return valid;
  };

  input.addEventListener('input', options.onInput);
  const field = formField('LaTeX', input, error);
  field.appendChild(blankOut);
  return {
    field,
    input,
    preview,
    validate,
    problem: () => (valid ? '' : (error.textContent ?? '')),
    value: () => normaliseBody(input.value),
  };
}

export function createLibraryForm(options: LibraryFormOptions): HTMLElement {
  const form = document.createElement('form');
  form.className = 'library-form';
  if (options.title !== undefined) {
    const heading = document.createElement('h3');
    heading.className = 'library-form__title';
    renderName(heading, options.title);
    form.appendChild(heading);
  }

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'field__control library-form__input';
  nameInput.value = options.initial.name ?? '';
  nameInput.autocomplete = 'off';
  const namePreview = document.createElement('p');
  namePreview.className = 'library-form__name-preview';
  namePreview.setAttribute('aria-hidden', 'true');
  namePreview.hidden = true;
  const nameHint = document.createElement('p');
  nameHint.className = 'field__hint';
  nameHint.setAttribute('role', 'status');

  const latex = createLatexEditor({
    initial: options.initial.body ?? '',
    emptyMessage: 'Enter the LaTeX for this formula.',
    onInput: () => refresh(),
  });
  const bodyInput = latex.input;

  const triggerInput = document.createElement('input');
  triggerInput.type = 'text';
  triggerInput.className = 'field__control library-form__input';
  triggerInput.value = options.initial.trigger ?? '';
  triggerInput.autocomplete = 'off';
  triggerInput.spellcheck = false;
  const triggerError = document.createElement('p');
  triggerError.className = 'field__error';
  triggerError.setAttribute('role', 'status');

  const keywordsInput = document.createElement('input');
  keywordsInput.type = 'text';
  keywordsInput.className = 'field__control library-form__input';
  keywordsInput.value = options.initial.keywords ?? '';
  keywordsInput.autocomplete = 'off';

  // Existing categories are offered, so a name is reused rather than
  // respelled into a second category.
  const categoryInput = document.createElement('input');
  categoryInput.type = 'text';
  categoryInput.className = 'field__control library-form__input';
  categoryInput.value = options.initial.category ?? '';
  categoryInput.autocomplete = 'off';
  const categoryList = document.createElement('datalist');
  categoryList.id = `library-categories-${fieldIdCounter++}`;
  for (const { label } of categoriesOf(getLibraryEntries())) {
    const option = document.createElement('option');
    option.value = label;
    categoryList.appendChild(option);
  }
  categoryInput.setAttribute('list', categoryList.id);

  const more = options.moreOptions ? document.createElement('details') : null;
  if (more) more.className = 'library-form__more';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn--primary';
  save.textContent = options.submitLabel;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--secondary';
  cancel.textContent = 'Cancel';

  /** The first field with a problem, for Enter to land on. */
  let firstProblem: { control: HTMLInputElement | HTMLTextAreaElement; message: string } | null =
    null;

  /** Re-validate and re-render the preview; returns overall validity. */
  const refresh = (): boolean => {
    const bodyValid = latex.validate();
    const triggerIssue = triggerProblem(triggerInput.value.trim(), options.excludeId);
    triggerError.textContent = triggerIssue ?? '';
    triggerInput.setAttribute('aria-invalid', String(triggerIssue !== null));
    firstProblem = !bodyValid
      ? { control: bodyInput, message: latex.problem() }
      : triggerIssue !== null
        ? { control: triggerInput, message: triggerIssue }
        : null;
    const valid = firstProblem === null;
    // A problem behind the closed disclosure would be invisible: open it.
    if (!valid && more && !more.open) more.open = true;
    // Duplicate names are warned about, never blocked.
    const name = nameInput.value.trim();
    const duplicate = getLibraryEntries().some(
      (entry) => entry.name === name && entry.id !== options.excludeId,
    );
    nameHint.textContent =
      name !== '' && duplicate ? 'Another formula already has this name.' : '';
    return valid;
  };

  for (const input of [nameInput, triggerInput]) {
    input.addEventListener('input', refresh);
  }
  // Maths between $ signs in the name is shown rendered under the field.
  const renderNamePreview = (): void => {
    const name = nameInput.value.trim();
    namePreview.hidden = !hasNameMaths(name);
    if (namePreview.hidden) namePreview.replaceChildren();
    else renderName(namePreview, name);
  };
  nameInput.addEventListener('input', renderNamePreview);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!refresh()) {
      // Save stays enabled so Enter always answers: the problem is read out
      // and focus lands on the field that has it.
      if (firstProblem) {
        announce(firstProblem.message, 'assertive');
        firstProblem.control.focus();
      }
      return;
    }
    const trigger = triggerInput.value.trim();
    const keywords = keywordsInput.value.trim();
    const category = categoryInput.value.trim();
    options.onSubmit({
      name: nameInput.value.trim() || 'Untitled formula',
      body: latex.value(),
      ...(trigger !== '' ? { trigger } : {}),
      ...(keywords !== '' ? { keywords } : {}),
      ...(category !== '' ? { category } : {}),
    });
    options.onClose();
  });
  cancel.addEventListener('click', () => options.onClose());
  form.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      options.onClose();
    }
  });

  // The quick form's equation is on screen in the field above it, so its
  // LaTeX preview sits with the LaTeX box behind More options, where an
  // edit can make the two differ.
  const bodyWrap = latex.field;
  const preview = latex.preview;
  const nameWrap = formField('Name', nameInput, nameHint);
  nameWrap.appendChild(namePreview);
  const triggerWrap = formField('Trigger (optional, used as \\trigger)', triggerInput, triggerError);
  const keywordsWrap = formField('Keywords (optional)', keywordsInput);
  const categoryWrap = formField('Category (optional)', categoryInput);
  categoryWrap.appendChild(categoryList);

  const buttons = document.createElement('div');
  buttons.className = 'library-form__buttons';
  buttons.append(save, cancel, ...(options.extraControls ?? []));

  if (more) {
    const summary = document.createElement('summary');
    summary.className = 'disclosure__summary';
    summary.textContent = 'More options';
    const moreBody = document.createElement('div');
    moreBody.className = 'library-form__more-body';
    moreBody.append(bodyWrap, preview, triggerWrap, keywordsWrap, categoryWrap);
    more.append(summary, moreBody);
    form.append(nameWrap, more, buttons);
  } else {
    form.append(nameWrap, bodyWrap, preview, triggerWrap, keywordsWrap, categoryWrap, buttons);
  }
  refresh();
  renderNamePreview();
  // Focus the name once mounted (the caller appends the form first).
  queueMicrotask(() => nameInput.focus());
  return form;
}
