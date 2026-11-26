// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCopyControls, createCopyStatus, installCopyShortcut } from './output';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from './settings';
import type { EditorController } from './editor';

function fakeEditor(): EditorController {
  return {
    element: {} as never,
    getValue: (format) => (format === 'latex' ? 'x' : '<math><mi>x</mi></math>'),
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

/** The two Copy buttons: one per format, the main one following the setting. */
describe('copy buttons', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await updateSettings({ copyFormat: DEFAULT_SETTINGS.copyFormat });
  });

  const labels = (group: HTMLElement): (string | null)[] =>
    Array.from(group.querySelectorAll('button')).map((button) => button.textContent);

  it('names each button for its format, the main format first', () => {
    const group = createCopyControls(fakeEditor());
    document.body.appendChild(group);
    expect(group.getAttribute('role')).toBe('group');
    expect(labels(group)).toEqual(['Copy MathML', 'Copy LaTeX']);
    const main = group.querySelector<HTMLButtonElement>('#copy-button')!;
    expect(main.classList.contains('btn--primary')).toBe(true);
    expect(main.getAttribute('aria-keyshortcuts')).toBe('Alt+C');
  });

  it('swaps the two when the main format changes in Settings', async () => {
    const group = createCopyControls(fakeEditor());
    document.body.appendChild(group);
    await updateSettings({ copyFormat: 'latex' });
    expect(labels(group)).toEqual(['Copy LaTeX', 'Copy MathML']);
    expect(getSettings().copyFormat).toBe('latex');
  });
});

/**
 * The result line: empty and out of the layout while idle, confirms a copy
 * on screen (the live region is visually hidden), and clears after a few
 * seconds or on the next edit – from either button and the shortcut alike.
 */
describe('copy result line', () => {
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

  it('takes no room until there is a result to show', () => {
    const status = createCopyStatus(fakeEditor());
    document.body.appendChild(status);
    expect(status.getAttribute('aria-hidden')).toBe('true');
    expect(status.hidden).toBe(true);
    expect(status.textContent).toBe('');
  });

  it('confirms a copy from the button, then clears', async () => {
    const editor = fakeEditor();
    const status = createCopyStatus(editor);
    const group = createCopyControls(editor);
    document.body.append(group, status);
    group.querySelector<HTMLButtonElement>('#copy-button')!.click();
    await vi.waitFor(() =>
      expect(status.textContent).toBe('Copied as MathML. Paste into your document.'),
    );
    expect(status.hidden).toBe(false);
    expect(status.classList.contains('actions-bar__status--done')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(status.hidden).toBe(true);
    expect(status.classList.contains('actions-bar__status--done')).toBe(false);
  });

  it('confirms a copy from the keyboard shortcut and idles on the next edit', async () => {
    const editor = editorWithChange();
    const status = createCopyStatus(editor);
    document.body.appendChild(status);
    const stop = installCopyShortcut(editor);
    document.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyC' }));
    await vi.waitFor(() =>
      expect(status.textContent).toBe('Copied as MathML. Paste into your document.'),
    );
    changeListeners.forEach((listener) => listener());
    expect(status.hidden).toBe(true);
    stop();
  });

  it('shows why nothing was copied when the equation is empty', async () => {
    const editor = fakeEditor();
    editor.isEmpty = () => true;
    const status = createCopyStatus(editor);
    const group = createCopyControls(editor);
    document.body.append(group, status);
    group.querySelector<HTMLButtonElement>('#copy-button')!.click();
    await vi.waitFor(() => expect(status.textContent).toBe('Nothing to copy. The equation is empty.'));
    expect(status.classList.contains('actions-bar__status--error')).toBe(true);
  });
  it('puts the chosen format on the clipboard, from the button and the shortcut', async () => {
    const editor = fakeEditor();
    document.body.append(createCopyControls(editor), createCopyStatus(editor));
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    const main = document.querySelector<HTMLButtonElement>('#copy-button')!;

    main.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenLastCalledWith(editor.getValue('mathml'));

    await updateSettings({ copyFormat: 'latex' });
    main.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText).toHaveBeenLastCalledWith(editor.getValue('latex'));

    const stop = installCopyShortcut(editor);
    document.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyC' }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
    expect(writeText).toHaveBeenLastCalledWith(editor.getValue('latex'));
    stop();
  });

  it('copies the other format from the second button, whatever the main one is', async () => {
    const editor = fakeEditor();
    const status = createCopyStatus(editor);
    document.body.append(createCopyControls(editor), status);
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    document.querySelector<HTMLButtonElement>('#copy-other-button')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenLastCalledWith(editor.getValue('latex'));
    await vi.waitFor(() =>
      expect(status.textContent).toBe('Copied as LaTeX. Paste into your document.'),
    );
    expect(getSettings().copyFormat).toBe('mathml');
  });
});
