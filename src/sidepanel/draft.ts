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

let lastWrite: Promise<void> = Promise.resolve();

function area(): chrome.storage.StorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.session;
}

function write(store: chrome.storage.StorageArea, latex: string): Promise<void> {
  return store.set({ [KEY]: latex }).catch((error: unknown) => {
    console.error('Failed to keep the equation:', error);
  });
}

/** Resolves once the latest edit is stored. */
export function flushDraft(): Promise<void> {
  return lastWrite;
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
  let restoring = false;
  // Every edit is written at once: a write started as the page closes can be
  // dropped, so nothing may wait for a pause in typing. Session storage is
  // held in memory and has no write quota.
  editor.onChange(() => {
    if (restoring) return;
    typed = true;
    lastWrite = write(store, editor.getLatex());
  });
  try {
    const stored = (await store.get(KEY))[KEY];
    if (typeof stored === 'string' && stored.length > 0 && !typed && editor.isEmpty()) {
      editor.setLatex(stored);
      // setLatex is silent; the views that mirror the field listen for input.
      restoring = true;
      editor.element.dispatchEvent(new Event('input', { bubbles: true }));
      restoring = false;
    }
  } catch (error) {
    console.error('Failed to read the kept equation:', error);
  }
}
