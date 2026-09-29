// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCopyControls, createCopyStatus, installCopyShortcut } from './output';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from './settings';
import type { EditorController } from './editor';

function fakeEditor(): EditorController {
  return {
    element: {} as never,
    getValue: () => '<math><mi>x</mi></math>',
    getLatex: () => 'x',
    getSpokenText: () => 'x',
    setLatex: () => {},
    insert: () => {},
    isEmpty: () => false,
    focus: () => {},
    onChange: () => () => {},
    setAutoBoxEnabled: () => {},
  };
}

/** The split Copy button: primary half, format menu half, and the setting round trip. */
describe('split Copy button', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    void updateSettings({ copyFormat: DEFAULT_SETTINGS.copyFormat });
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
  });

  it('names the format half after the current format and offers a radio menu', () => {
    const group = createCopyControls(fakeEditor());
    document.body.appendChild(group);
    expect(group.getAttribute('role')).toBe('group');
    const copy = group.querySelector<HTMLButtonElement>('.copy-split__main');
    const more = group.querySelector<HTMLButtonElement>('.copy-split__more');
    expect(copy?.textContent).toBe('Copy');
    expect(more?.getAttribute('aria-label')).toBe('Copy as MathML – change format');
    expect(more?.getAttribute('aria-haspopup')).toBe('menu');

    more!.click();
    const items = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(items.map((i) => i.textContent)).toEqual(['MathML', 'LaTeX']);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    expect(items[1]!.getAttribute('aria-checked')).toBe('false');
  });

  it('changes the copy format from the menu and re-names the trigger', () => {
    const group = createCopyControls(fakeEditor());
    document.body.appendChild(group);
    const more = group.querySelector<HTMLButtonElement>('.copy-split__more')!;
    more.click();
    group.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[1]!.click();
    expect(getSettings().copyFormat).toBe('latex');
    expect(more.getAttribute('aria-label')).toBe('Copy as LaTeX – change format');
    expect(document.activeElement).toBe(more);
  });
});

/**
 * The visible copy caption: names the format while idle, confirms a copy on
 * screen (the live region is visually hidden), and idles again after a few
 * seconds or on the next edit – from the button and the shortcut alike.
 */
describe('copy caption', () => {
  let changeListeners: (() => void)[] = [];

  function editorWithChange(): EditorController {
    const editor = fakeEditor();
    editor.onChange = (listener: () => void) => {
      changeListeners.push(listener);
      return () => {};
    };
    return editor;
  }

  beforeEach(async () => {
    document.body.innerHTML = '';
    changeListeners = [];
    await updateSettings({ copyFormat: DEFAULT_SETTINGS.copyFormat });
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
    vi.stubGlobal('ClipboardItem', undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is on screen (not visually hidden) and names the current format while idle', async () => {
    const status = createCopyStatus(fakeEditor());
    document.body.appendChild(status);
    expect(status.classList.contains('visually-hidden')).toBe(false);
    expect(status.getAttribute('aria-hidden')).toBe('true');
    expect(status.textContent).toBe('Copy as MathML');
    await updateSettings({ copyFormat: 'latex' });
    expect(status.textContent).toBe('Copy as LaTeX');
  });

  it('confirms a copy from the button, then idles again after three seconds', async () => {
    const editor = fakeEditor();
    const status = createCopyStatus(editor);
    const group = createCopyControls(editor);
    document.body.append(group, status);
    group.querySelector<HTMLButtonElement>('.copy-split__main')!.click();
    await vi.waitFor(() => expect(status.textContent).toBe('Copied as MathML'));
    expect(status.classList.contains('actions-bar__status--done')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(status.textContent).toBe('Copy as MathML');
    expect(status.classList.contains('actions-bar__status--done')).toBe(false);
  });

  it('confirms a copy from the keyboard shortcut and idles on the next edit', async () => {
    const editor = editorWithChange();
    const status = createCopyStatus(editor);
    document.body.appendChild(status);
    const stop = installCopyShortcut(editor);
    document.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyC' }));
    await vi.waitFor(() => expect(status.textContent).toBe('Copied as MathML'));
    changeListeners.forEach((listener) => listener());
    expect(status.textContent).toBe('Copy as MathML');
    stop();
  });

  it('shows why nothing was copied when the equation is empty', async () => {
    const editor = fakeEditor();
    editor.isEmpty = () => true;
    const status = createCopyStatus(editor);
    const group = createCopyControls(editor);
    document.body.append(group, status);
    group.querySelector<HTMLButtonElement>('.copy-split__main')!.click();
    await vi.waitFor(() => expect(status.textContent).toBe('Nothing to copy. The equation is empty.'));
    expect(status.classList.contains('actions-bar__status--error')).toBe(true);
  });
});
