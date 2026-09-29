/**
 * Output: format conversion + clipboard, plus the accessible split "Copy" button.
 *
 * The user picks a format (remembered as a setting) and copies on a single
 * affordance. Clipboard writes use the async Clipboard API and provide the
 * richest representation appropriate to the format so paste targets get the
 * best version.
 */
import type { OutputFormat } from '../types';
import type { EditorController } from './editor';
import { announce } from './a11y';
import { stripRedundantFences } from './latex-clean';
import { getSettings, updateSettings, onSettingsChange } from './settings';
import { createMenu } from './menu';
import { COPY_SHORTCUT_LABEL } from './shortcut-labels';

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

/**
 * The split Copy button for the actions bar: a primary "Copy" half that
 * copies in the current format, and a narrow "▾" half that opens a
 * `menuitemradio` menu to change the format (remembered as a setting). The
 * menu opens upward – the bar is pinned to the bottom of the panel – and its
 * trigger's name always states the current format, so a screen-reader user
 * hears "Copy as MathML – change format" before deciding to open it.
 */
export function createCopyControls(editor: EditorController): HTMLElement {
  const group = document.createElement('div');
  group.className = 'copy-split';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Copy equation');

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn--primary copy-split__main output__copy';
  copyBtn.id = 'copy-button';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => void copyEquation(editor, copyBtn));

  const formatMenu = createMenu({
    id: 'copy-format',
    label: '',
    triggerClass: 'btn btn--primary copy-split__more',
    align: 'end',
    entries: FORMATS.map((meta) => ({
      kind: 'radio' as const,
      label: meta.label,
      checked: () => getSettings().copyFormat === meta.id,
      onSelect: () => {
        void updateSettings({ copyFormat: meta.id });
        announce(`Copy format set to ${meta.announceName}`);
      },
    })),
  });

  const describe = (format: OutputFormat): void => {
    const name = FORMATS.find((f) => f.id === format)?.label ?? format;
    formatMenu.trigger.setAttribute('aria-label', `Copy as ${name} – change format`);
    formatMenu.trigger.title = `Copy as ${name} – change format`;
  };
  describe(getSettings().copyFormat);
  onSettingsChange((next) => describe(next.copyFormat));

  group.append(copyBtn, formatMenu.root);
  return group;
}

/** How long a copy result stays on screen before the caption idles again. */
const COPY_STATUS_TIMEOUT_MS = 3000;

/**
 * The visible caption under the actions bar that carries the result of a
 * copy. It is the sighted user's confirmation: the live region is
 * visually hidden, so without it Copy (and Alt+C) would change nothing on
 * screen. Idle, it names the current copy format, which otherwise only the
 * format half's accessible name states.
 */
interface CopyStatus {
  readonly element: HTMLElement;
  /** Show a result for a few seconds, then idle again. */
  show(text: string, kind: 'done' | 'error'): void;
  /** Back to naming the current format. */
  idle(): void;
}

/**
 * Registered by {@link createCopyStatus}; `copyEquation` writes to it from
 * both the button and the keyboard shortcut, and it is absent where the bar
 * is not mounted (the e2e harness, unit tests).
 */
let copyStatus: CopyStatus | null = null;

/** Name the current copy format in the user's terms. */
function formatName(format: OutputFormat): string {
  return FORMATS.find((f) => f.id === format)?.label ?? format;
}

/**
 * Build the copy caption for the actions bar. It is `aria-hidden`: the live
 * region already announces the same result, so a screen reader would
 * otherwise hear it twice. The caption idles again after
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
    element.textContent = `Copy as ${formatName(getSettings().copyFormat)}`;
    element.classList.remove('actions-bar__status--done', 'actions-bar__status--error');
  };
  const show = (text: string, kind: 'done' | 'error'): void => {
    clearTimeout(timer);
    element.textContent = text;
    element.classList.toggle('actions-bar__status--done', kind === 'done');
    element.classList.toggle('actions-bar__status--error', kind === 'error');
    timer = setTimeout(idle, COPY_STATUS_TIMEOUT_MS);
  };

  idle();
  // A format change while a result is showing is a fresh state: idle on it.
  let shownFormat = getSettings().copyFormat;
  onSettingsChange((next) => {
    if (next.copyFormat === shownFormat) return;
    shownFormat = next.copyFormat;
    idle();
  });
  editor.onChange(() => {
    if (timer !== undefined) idle();
  });

  copyStatus = { element, show, idle };
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
): Promise<void> {
  if (editor.isEmpty()) {
    const empty = 'Nothing to copy. The equation is empty.';
    announce(empty, 'assertive');
    copyStatus?.show(empty, 'error');
    return;
  }

  const format = getSettings().copyFormat;
  const meta = FORMATS.find((f) => f.id === format);

  try {
    await copyToClipboard(buildPayload(editor, format));
    const copied = `Copied as ${meta?.announceName ?? format}`;
    announce(copied);
    copyStatus?.show(copied, 'done');
  } catch (error) {
    console.error('Copy failed:', error);
    // Chromium rejects clipboard writes with NotAllowedError when the panel
    // document is not focused or the permission is denied: the fix is on the
    // user's side, so the message names it.
    const failed =
      (error as { name?: string } | null)?.name === 'NotAllowedError'
        ? `Copy needs the panel to be focused – click in the equation, then press ${COPY_SHORTCUT_LABEL}`
        : 'Copy failed – click in the panel and try again';
    announce(failed, 'assertive');
    copyStatus?.show(failed, 'error');
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
