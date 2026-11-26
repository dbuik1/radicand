import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EditorController } from './editor';

/** A field stand-in: a value, change listeners and an element for events. */
function fakeEditor(initial = '') {
  let value = initial;
  const listeners = new Set<() => void>();
  const element = new EventTarget();
  const editor = {
    element,
    getLatex: () => value,
    setLatex: (latex: string) => {
      value = latex;
    },
    isEmpty: () => value.trim().length === 0,
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as EditorController;
  const type = (latex: string): void => {
    value = latex;
    listeners.forEach((listener) => listener());
  };
  return { editor, element, type };
}

describe('the kept equation', () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    stored = {};
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(stored, items);
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns to an empty field and tells the views that mirror it', async () => {
    stored.draft = 'x^2';
    const { editor, element } = fakeEditor();
    const heard = vi.fn();
    element.addEventListener('input', heard);
    const { installDraft } = await import('./draft');
    await installDraft(editor);
    expect(editor.getLatex()).toBe('x^2');
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('leaves the field alone when the user typed first', async () => {
    stored.draft = 'x^2';
    const { editor, type } = fakeEditor();
    const { installDraft } = await import('./draft');
    const installed = installDraft(editor);
    type('y');
    await installed;
    expect(editor.getLatex()).toBe('y');
  });

  it('stores each edit at once, with no pause', async () => {
    const { editor, type } = fakeEditor();
    const { installDraft, flushDraft } = await import('./draft');
    await installDraft(editor);
    type('a');
    type('a+b');
    await flushDraft();
    expect(stored.draft).toBe('a+b');
    expect(chrome.storage.session.set).toHaveBeenCalledTimes(2);
  });

  it('does not write the equation it has just put back', async () => {
    stored.draft = 'x^2';
    const { editor, element, type } = fakeEditor();
    element.addEventListener('input', () => type(editor.getLatex()));
    const { installDraft } = await import('./draft');
    await installDraft(editor);
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  it('stores an emptied field, so nothing returns', async () => {
    stored.draft = 'x';
    const { editor, type } = fakeEditor('x');
    const { installDraft, flushDraft } = await import('./draft');
    await installDraft(editor);
    type('');
    await flushDraft();
    expect(stored.draft).toBe('');
  });
});
