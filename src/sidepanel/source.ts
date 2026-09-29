/**
 * Source / preview view.
 *
 * A secondary, collapsible surface: the main editing happens in the WYSIWYG
 * field. This box shows the equation in the chosen **display** format (separate
 * from the copy format) and, where the format round-trips reliably, lets the
 * user edit it:
 *
 * - **LaTeX** – editable (MathLive's native format).
 * - **MathML** – read-only preview (no reliable import path; edit via LaTeX).
 *
 * Accessibility: a native `<details>` disclosure, a native `<select>` for the
 * display format, and a `<textarea>` with a descriptive accessible name.
 */
import type { EditorController } from './editor';
import type { OutputFormat } from '../types';
import { getSettings, updateSettings, onSettingsChange } from './settings';
import { createFormatSelect } from './output';
import { bindPart } from './part-visibility';

/** Formats offered for *display* in the source box. */
const DISPLAY_FORMATS: readonly OutputFormat[] = ['latex', 'mathml'];

const FORMAT_NAME: Record<OutputFormat, string> = {
  latex: 'LaTeX',
  mathml: 'MathML',
};

function serialise(editor: EditorController, format: OutputFormat): string {
  return format === 'latex' ? editor.getLatex() : editor.getValue('mathml');
}

export function createSourceView(editor: EditorController): HTMLElement {
  const details = document.createElement('details');
  details.className = 'source';
  // Closed by default – most copies never touch the source, and raw LaTeX is
  // noise to users who don't read it. The open state persists per user, so
  // LaTeX-fluent users pay the cost once.
  details.open = getSettings().sourceOpen;
  details.addEventListener('toggle', () => {
    if (details.open !== getSettings().sourceOpen) {
      void updateSettings({ sourceOpen: details.open });
    }
  });

  // The whole disclosure is a piece of interface the user can switch off; the
  // hairline above it goes with it (see boot in main.ts).
  bindPart('source', details);

  const summary = document.createElement('summary');
  summary.className = 'disclosure__summary';
  summary.textContent = 'Equation source';
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'source__body';

  // "Show as" – the display format, independent of the copy format (merging
  // them would make the export format silently follow whatever is displayed:
  // a classic mode error).
  body.appendChild(
    createFormatSelect({
      id: 'display-format',
      label: 'Show as',
      formats: DISPLAY_FORMATS,
      get: () => getSettings().displayFormat,
      set: (displayFormat) => void updateSettings({ displayFormat }),
    }),
  );

  const textarea = document.createElement('textarea');
  textarea.id = 'source-input';
  textarea.className = 'source__input';
  textarea.rows = 2;
  textarea.spellcheck = false;
  textarea.autocapitalize = 'off';
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');
  body.appendChild(textarea);

  // Suspend structure auto-boxing while the user edits raw LaTeX here, so a
  // half-typed `\frac` is not rewritten out from under them (the textarea and
  // field would desync until blur).
  textarea.addEventListener('focus', () => editor.setAutoBoxEnabled(false));
  textarea.addEventListener('blur', () => editor.setAutoBoxEnabled(true));

  details.appendChild(body);

  let format: OutputFormat = getSettings().displayFormat;

  const applyFormat = (): void => {
    const editable = format === 'latex';
    textarea.readOnly = !editable;
    textarea.classList.toggle('source__input--readonly', !editable);
    textarea.setAttribute(
      'aria-label',
      editable
        ? `Equation source in ${FORMAT_NAME[format]}`
        : `Equation in ${FORMAT_NAME[format]} (read-only – switch "Show as" to LaTeX to edit)`,
    );
    if (document.activeElement !== textarea) {
      textarea.value = serialise(editor, format);
    }
  };

  editor.onChange(() => {
    if (document.activeElement === textarea) return;
    const next = serialise(editor, format);
    if (textarea.value !== next) textarea.value = next;
  });

  textarea.addEventListener('input', () => {
    if (!textarea.readOnly) editor.setLatex(textarea.value);
  });

  onSettingsChange((settings) => {
    if (settings.displayFormat === format) return;
    format = settings.displayFormat;
    applyFormat();
  });

  applyFormat();
  return details;
}
