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
  let pagehide: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    stored = {};
    pagehide = undefined;
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'pagehide') pagehide = listener;
      },
    });
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

  it('stores an edit after a pause', async () => {
    const { editor, type } = fakeEditor();
    const { installDraft } = await import('./draft');
    await installDraft(editor);
    type('a+b');
    expect(stored.draft).toBeUndefined();
    await vi.advanceTimersByTimeAsync(300);
    expect(stored.draft).toBe('a+b');
  });

  it('stores a pending edit when the page closes', async () => {
    const { editor, type } = fakeEditor();
    const { installDraft } = await import('./draft');
    await installDraft(editor);
    type('a+b');
    pagehide?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(stored.draft).toBe('a+b');
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
