/**
 * "Save to library": the capture affordance in the actions bar,
 * plus the panel-wide Alt+S shortcut (installed like Alt+C in output.ts).
 * Captures the selection when there is one – saving a sub-expression is
 * how a library of parts gets built – otherwise the whole equation, and
 * opens the shared form in the workspace's Save to library mode (the host
 * supplies the mode's title and body; see workspace.ts) with the name
 * pre-filled as the captured maths between `$` signs. The fast path is genuinely two keys
 * and a name: Alt+S, type the name, Enter – LaTeX, trigger and keywords
 * wait behind a "More options" disclosure.
 */
import type { EditorController } from './editor';
import { announce } from './a11y';
import { createLibraryForm } from './library-form';
import { spokenName } from './name-maths';
import { addLibraryEntry, isLibraryReadOnly } from './library';

export interface LibraryCapture {
  /** The "Save to library" button, for the equation actions row. */
  button: HTMLButtonElement;
  /** Open the capture form; `opener` is where Close returns focus to. */
  open: (opener?: HTMLElement | null) => void;
}

/** Where the form is shown: the workspace's Save to library mode. */
export interface LibraryCaptureHost {
  /** Show the mode under `title` and return the element to render into. */
  show: (title: string, opener?: HTMLElement | null) => HTMLElement;
  /** Leave the mode (the form is done); focus is the caller's to place. */
  hide: () => void;
}

/**
 * Suggest the captured LaTeX as a maths name, so the name reads as the
 * formula until the user types a better one. Never truncated: a cut in
 * the middle of a command would not render.
 */
function suggestName(latex: string): string {
  const cleaned = latex.replace(/\s+/g, ' ').trim();
  return cleaned === '' ? '' : `$${cleaned}$`;
}

export function createLibraryCapture(
  editor: EditorController,
  host: LibraryCaptureHost,
): LibraryCapture {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary';
  button.textContent = 'Save to library';

  const close = (): void => {
    host.hide();
    editor.focus();
  };

  const open = (opener: HTMLElement | null = null): void => {
    if (editor.isEmpty()) {
      announce('Nothing to save. The equation is empty.', 'assertive');
      return;
    }
    if (isLibraryReadOnly()) {
      announce(
        'The library was saved by a newer version of the extension and is read-only here.',
        'assertive',
      );
      return;
    }
    const mf = editor.element;
    const hasSelection = !mf.selectionIsCollapsed;
    const body = hasSelection ? mf.getValue(mf.selection, 'latex') : editor.getLatex();
    const body_ = host.show(hasSelection ? 'Save selection to library' : 'Save to library', opener);
    body_.replaceChildren(
      createLibraryForm({
        initial: { name: suggestName(body), body },
        submitLabel: 'Save',
        moreOptions: true,
        onSubmit: (fields) => {
          const entry = addLibraryEntry(fields);
          announce(`Saved "${spokenName(entry.name)}" to your library`);
        },
        onClose: close,
      }),
    );
  };

  button.addEventListener('click', () => open(button));
  return { button, open };
}

/**
 * Install the panel-wide Alt+S shortcut. Matched on the physical key
 * (`code`), like Alt+C: Option+S on a Mac produces a different character
 * as `key` under many layouts. Returns an unsubscribe function.
 */
export function installLibrarySaveShortcut(open: () => void): () => void {
  const onKeydown = (event: KeyboardEvent): void => {
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.code === 'KeyS'
    ) {
      event.preventDefault();
      open();
    }
  };
  document.addEventListener('keydown', onKeydown);
  return () => document.removeEventListener('keydown', onKeydown);
}
