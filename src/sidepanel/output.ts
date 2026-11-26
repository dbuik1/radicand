/**
 * Output: format conversion and the clipboard, plus the two Copy buttons.
 *
 * Each button copies one format; the main format is a setting. Clipboard
 * writes use the async Clipboard API and provide the richest representation
 * appropriate to the format so paste targets get the best version.
 */
import type { OutputFormat } from '../types';
import type { EditorController } from './editor';
import { report, setResultDisplay } from './a11y';
import { stripRedundantFences } from './latex-clean';
import { getSettings, onSettingsChange } from './settings';
import { COPY_SHORTCUT_KEYS, COPY_SHORTCUT_LABEL } from './shortcut-labels';

interface FormatMeta {
  readonly id: OutputFormat;
  readonly label: string;
  /** Spoken/announced confirmation, e.g. "Copied as MathML". */
  readonly announceName: string;
}

/** Formats the user can choose from. */
const FORMATS: readonly FormatMeta[] = [
  { id: 'mathml', label: 'MathML', announceName: 'MathML' },
  { id: 'latex', label: 'LaTeX', announceName: 'LaTeX' },
];

/** A clipboard payload: always plain text, optionally a richer HTML variant. */
export interface ClipboardPayload {
  plain: string;
  html?: string;
}

/**
 * Build the clipboard payload for a format from the live field. For MathML we
 * additionally provide a `text/html` representation so maths-aware paste
 * targets (e.g. word processors) can consume the markup.
 */
export function buildPayload(
  editor: EditorController,
  format: OutputFormat,
): ClipboardPayload {
  switch (format) {
    case 'mathml': {
      const mathml = editor.getValue('mathml');
      return { plain: mathml, html: mathml };
    }
    case 'latex': {
      const latex = editor.getValue('latex');
      // Tidy at the copy boundary only – the editor and the two-way source
      // view keep MathLive's growing fences (see latex-clean.ts).
      return {
        plain: getSettings().tidyBrackets ? stripRedundantFences(latex) : latex,
      };
    }
    default: {
      // Exhaustiveness guard.
      const _never: never = format;
      throw new Error(`Unsupported format: ${String(_never)}`);
    }
  }
}

/**
 * Write a payload to the clipboard. Prefers a rich `ClipboardItem`
 * (text/html + text/plain); falls back to plain-text `writeText` where the
 * richer API is unavailable.
 */
export async function copyToClipboard(payload: ClipboardPayload): Promise<void> {
  const canWriteRich =
    typeof ClipboardItem !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === 'function';

  if (payload.html && canWriteRich) {
    const item = new ClipboardItem({
      'text/html': new Blob([payload.html], { type: 'text/html' }),
      'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }

  await navigator.clipboard.writeText(payload.plain);
}

/**
 * A labelled `<select>` for choosing a format. Reused for the "Copy as" control
 * here and the "Show as" control in the source view. Keeps itself in sync if
 * the underlying setting changes elsewhere.
 */
export function createFormatSelect(options: {
  id: string;
  label: string;
  formats: readonly OutputFormat[];
  get: () => OutputFormat;
  set: (format: OutputFormat) => void;
}): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'format-select';

  const label = document.createElement('label');
  label.htmlFor = options.id;
  label.className = 'format-select__label';
  label.textContent = options.label;

  const select = document.createElement('select');
  select.id = options.id;
  select.className = 'format-select__control';
  for (const id of options.formats) {
    const meta = FORMATS.find((f) => f.id === id);
    const el = document.createElement('option');
    el.value = id;
    el.textContent = meta?.label ?? id;
    if (id === options.get()) el.selected = true;
    select.appendChild(el);
  }
  select.addEventListener('change', () => options.set(select.value as OutputFormat));

  onSettingsChange(() => {
    const value = options.get();
    if (select.value !== value) select.value = value;
  });

  wrap.append(label, select);
  return wrap;
}

/** The other format: the one the secondary Copy button offers. */
function otherFormat(format: OutputFormat): OutputFormat {
  return format === 'latex' ? 'mathml' : 'latex';
}

/**
 * The two Copy buttons for the actions bar, one per format, each named for
 * what it copies. The first is the main format (set in Settings): it is the
 * primary action and the one Alt+C uses. Both formats are one press away, so
 * nobody has to change a setting to get the other.
 */
export function createCopyControls(editor: EditorController): HTMLElement {
  const group = document.createElement('div');
  group.className = 'copy-pair';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Copy equation');

  const mainBtn = document.createElement('button');
  mainBtn.type = 'button';
  mainBtn.className = 'btn btn--primary copy-pair__main output__copy';
  mainBtn.id = 'copy-button';
  mainBtn.setAttribute('aria-keyshortcuts', COPY_SHORTCUT_KEYS);
  mainBtn.addEventListener('click', () => void copyEquation(editor, mainBtn));

  const otherBtn = document.createElement('button');
  otherBtn.type = 'button';
  otherBtn.className = 'btn btn--secondary copy-pair__other';
  otherBtn.id = 'copy-other-button';
  otherBtn.addEventListener(
    'click',
    () => void copyEquation(editor, otherBtn, otherFormat(getSettings().copyFormat)),
  );

  const describe = (format: OutputFormat): void => {
    mainBtn.textContent = `Copy ${formatName(format)}`;
    otherBtn.textContent = `Copy ${formatName(otherFormat(format))}`;
  };
  describe(getSettings().copyFormat);
  onSettingsChange((next) => describe(next.copyFormat));

  group.append(mainBtn, otherBtn);
  return group;
}

/** The shortest time a result stays on screen before the caption idles again. */
const COPY_STATUS_TIMEOUT_MS = 3000;
/** Longer results stay longer: this much reading time for each character. */
const STATUS_MS_PER_CHARACTER = 70;

/** Name a copy format in the user's terms. */
function formatName(format: OutputFormat): string {
  return FORMATS.find((f) => f.id === format)?.label ?? format;
}

/**
 * Build the result line under the actions bar. It shows the result of a
 * copy, a save or an import, which the visually hidden live region alone
 * would leave off the screen, and is empty and out of the layout otherwise.
 * It is `aria-hidden`: the live region already announces the same result,
 * so a screen reader would otherwise hear it twice. The line clears after
 * {@link COPY_STATUS_TIMEOUT_MS} or as soon as the equation changes,
 * whichever comes first, so a stale "Copied" never sits under new content.
 */
export function createCopyStatus(editor: EditorController): HTMLElement {
  const element = document.createElement('p');
  element.className = 'actions-bar__status';
  element.setAttribute('aria-hidden', 'true');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const idle = (): void => {
    clearTimeout(timer);
    timer = undefined;
    element.textContent = '';
    element.hidden = true;
    element.classList.remove('actions-bar__status--done', 'actions-bar__status--error');
  };
  const show = (text: string, kind: 'done' | 'error'): void => {
    clearTimeout(timer);
    element.textContent = text;
    element.hidden = false;
    element.classList.toggle('actions-bar__status--done', kind === 'done');
    element.classList.toggle('actions-bar__status--error', kind === 'error');
    timer = setTimeout(idle, Math.max(COPY_STATUS_TIMEOUT_MS, text.length * STATUS_MS_PER_CHARACTER));
  };

  idle();
  editor.onChange(() => {
    if (timer !== undefined) idle();
  });

  setResultDisplay(show);
  return element;
}

/**
 * Copy the current equation in the user's chosen format, announcing success
 * or failure to the live region and showing the same result in the visible
 * copy caption (`createCopyStatus`). Shared by the Copy button
 * (`createCopyControls`) and the document-wide copy shortcut (see
 * shortcut-labels.ts), so both paths behave identically.
 *
 * `trigger`, when given, is refocused afterwards so a mouse/keyboard user who
 * activated an on-screen control stays oriented. The keyboard shortcut omits
 * it deliberately: it can fire with focus anywhere in the panel (e.g. inside
 * the equation field), and copying should never relocate focus away from
 * wherever the user already is.
 */
async function copyEquation(
  editor: EditorController,
  trigger?: HTMLElement,
  format: OutputFormat = getSettings().copyFormat,
): Promise<void> {
  if (editor.isEmpty()) {
    const empty = 'Nothing to copy. The equation is empty.';
    report(empty, 'error');
    return;
  }

  const meta = FORMATS.find((f) => f.id === format);

  try {
    await copyToClipboard(buildPayload(editor, format));
    const copied = `Copied as ${meta?.announceName ?? format}. Paste into your document.`;
    report(copied);
  } catch (error) {
    console.error('Copy failed:', error);
    // Chromium rejects clipboard writes with NotAllowedError when the panel
    // document is not focused or the permission is denied: the fix is on the
    // user's side, so the message names it.
    const failed =
      (error as { name?: string } | null)?.name === 'NotAllowedError'
        ? `Copy needs the panel to be focused – click in the equation, then press ${COPY_SHORTCUT_LABEL}`
        : 'Copy failed – click in the panel and try again';
    report(failed, 'error');
  } finally {
    trigger?.focus();
  }
}

/**
 * Install the panel-wide "copy the equation" keyboard shortcut (Alt+C). Active
 * regardless of where focus currently is in the panel, including inside the
 * equation field itself. Returns an unsubscribe function (not needed for the
 * panel's lifetime, but kept for symmetry/testability).
 */
export function installCopyShortcut(editor: EditorController): () => void {
  const onKeydown = (event: KeyboardEvent): void => {
    // Matched on the physical key (`code`), not the produced character
    // (`key`): Alt+C is Option+C on a Mac, which types the accented
    // character `ç` as `key` under a US layout, not the letter `c`.
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.code === 'KeyC'
    ) {
      event.preventDefault();
      void copyEquation(editor);
    }
  };
  document.addEventListener('keydown', onKeydown);
  return () => document.removeEventListener('keydown', onKeydown);
}
