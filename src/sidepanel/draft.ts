/**
 * Keeps the equation in the field across a panel close, a reload and a move
 * to another window or tab.
 *
 * The LaTeX lives in `chrome.storage.session`: it survives everything short
 * of quitting the browser, never reaches disk and never syncs. An equation
 * is working text, not a saved formula, so it should not outlive the
 * browser session; the library is where an equation is kept on purpose.
 *
 * Two open surfaces share the one draft and the last edit wins. Neither
 * follows the other live, because a field that rewrites itself under the
 * caret is worse than a stale one.
 */

import type { EditorController } from './editor';

const KEY = 'draft';
const DEBOUNCE_MS = 300;

let pending: (() => string) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function area(): chrome.storage.StorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.session;
}

/** Write any pending edit now. Resolves once the draft is stored. */
export async function flushDraft(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const read = pending;
  pending = undefined;
  const store = area();
  if (!read || !store) return;
  try {
    await store.set({ [KEY]: read() });
  } catch (error) {
    console.error('Failed to keep the equation:', error);
  }
}

/**
 * Put the kept equation back in the field, then keep the field's later
 * edits. The field is left alone if the user typed before the read came
 * back.
 */
export async function installDraft(editor: EditorController): Promise<void> {
  const store = area();
  if (!store) return;
  let typed = false;
  editor.onChange(() => {
    typed = true;
    pending = () => editor.getLatex();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushDraft(), DEBOUNCE_MS);
  });
  // A close inside the debounce window still keeps the last edit.
  window.addEventListener('pagehide', () => void flushDraft());
  try {
    const stored = (await store.get(KEY))[KEY];
    if (typeof stored === 'string' && stored.length > 0 && !typed && editor.isEmpty()) {
      editor.setLatex(stored);
      // setLatex is silent; the views that mirror the field listen for input.
      editor.element.dispatchEvent(new Event('input', { bubbles: true }));
      pending = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
  } catch (error) {
    console.error('Failed to read the kept equation:', error);
  }
}
