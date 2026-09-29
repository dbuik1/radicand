// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';

import { createSourceView } from './source';
import { updateSettings, DEFAULT_SETTINGS } from './settings';
import type { EditorController } from './editor';

function fakeEditor(initial = '') {
  let latex = initial;
  const listeners = new Set<() => void>();
  const controller: EditorController = {
    element: {} as never,
    getValue: (format) =>
      format === 'mathml' ? `<math>${latex}</math>` : latex,
    getLatex: () => latex,
    getSpokenText: () => '',
    setLatex: (value: string) => {
      latex = value;
      for (const l of listeners) l();
    },
    insert: () => {},
    isEmpty: () => latex.trim() === '',
    focus: () => {},
    onChange: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setAutoBoxEnabled: () => {},
  };
  return {
    controller,
    setFromField: (value: string) => {
      latex = value;
      for (const l of listeners) l();
    },
  };
}

const setDisplay = (format: string) =>
  updateSettings({ displayFormat: format as never });

describe('format-aware source view', () => {
  let textarea: HTMLTextAreaElement;
  let api: ReturnType<typeof fakeEditor>;

  beforeEach(async () => {
    document.body.innerHTML = '';
    await updateSettings({ displayFormat: DEFAULT_SETTINGS.displayFormat });
    api = fakeEditor('x^2');
    const view = createSourceView(api.controller);
    document.body.appendChild(view);
    textarea = view.querySelector('textarea')!;
  });

  it('is a collapsible disclosure with a "Show as" select', () => {
    expect(document.querySelector('details.source')).toBeTruthy();
    expect(document.querySelector('#display-format')).toBeTruthy();
  });

  it('defaults to editable LaTeX and shows the current LaTeX', () => {
    expect(textarea.readOnly).toBe(false);
    expect(textarea.value).toBe('x^2');
  });

  it('becomes read-only MathML when display switches to MathML', async () => {
    await setDisplay('mathml');
    expect(textarea.readOnly).toBe(true);
    expect(textarea.value).toBe('<math>x^2</math>');
    expect(textarea.getAttribute('aria-label')).toContain('read-only');
  });

  it('applies LaTeX edits back to the field', () => {
    textarea.value = '\\frac{1}{2}';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(api.controller.getLatex()).toBe('\\frac{1}{2}');
  });

  it('reflects field changes back into the source when not focused', () => {
    api.setFromField('a+b');
    expect(textarea.value).toBe('a+b');
  });

  it('does not clobber the source while the user is typing in it', () => {
    textarea.focus();
    textarea.value = '\\sqrt{';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    api.setFromField('something else');
    expect(textarea.value).toBe('\\sqrt{');
  });

  it('disables auto-boxing while the textarea has focus', () => {
    const autoBoxCalls: boolean[] = [];
    const mockEditor: EditorController = {
      element: {} as never,
      getValue: () => 'x^2',
      getLatex: () => 'x^2',
      getSpokenText: () => '',
      setLatex: () => {},
      insert: () => {},
      isEmpty: () => false,
      focus: () => {},
      onChange: () => () => {},
      setAutoBoxEnabled: (enabled: boolean) => autoBoxCalls.push(enabled),
    };

    document.body.innerHTML = '';
    const view = createSourceView(mockEditor);
    document.body.appendChild(view);
    const ta = view.querySelector('textarea')!;

    ta.dispatchEvent(new Event('focus', { bubbles: true }));
    ta.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(autoBoxCalls).toEqual([false, true]);
  });
});
