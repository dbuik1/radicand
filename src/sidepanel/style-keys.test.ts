// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildStyleKeys } from './style-keys';
import type { EditorController } from './editor';

/**
 * The text style keys against a scripted mathfield stub: applyStyle calls,
 * the tri-state pressed value from queryStyle, and the selection round
 * trip. The real MathLive interplay (arming, toggling, empty-field pending)
 * is covered by tests/e2e/specs/styling.spec.mjs against a live field.
 */
function stubEditor() {
  const applyStyle = vi.fn();
  const listeners = new Map<string, (() => void)[]>();
  const element = {
    applyStyle,
    queryStyle: vi.fn().mockReturnValue('none'),
    getValue: vi.fn().mockReturnValue('x'),
    selection: { ranges: [[0, 1]] },
    position: 0,
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
  };
  const focus = vi.fn();
  const editor = { element, focus } as unknown as EditorController;
  const fire = (type: string): void => {
    for (const fn of listeners.get(type) ?? []) fn();
  };
  return { editor, element, applyStyle, focus, fire };
}

const keys = (root: HTMLElement): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button'));

describe('text style keys', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="sr-status"></div>';
  });

  it('is a toolbar of six named toggle keys with one Tab stop', () => {
    const root = buildStyleKeys(stubEditor().editor);
    document.body.appendChild(root);
    expect(root.getAttribute('role')).toBe('toolbar');
    expect(keys(root).map((key) => key.getAttribute('aria-label'))).toEqual([
      'Bold',
      'Italic',
      'Upright',
      'Blackboard bold',
      'Calligraphic',
      'Fraktur',
    ]);
    expect(keys(root).filter((key) => key.tabIndex === 0)).toHaveLength(1);
    expect(keys(root).every((key) => key.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('applies its style to the selection and keeps focus in the field', () => {
    const { editor, element, applyStyle, focus } = stubEditor();
    const root = buildStyleKeys(editor);
    document.body.appendChild(root);
    const selection = element.selection;
    keys(root)[0]!.click();
    expect(focus).toHaveBeenCalled();
    expect(element.selection).toBe(selection);
    expect(applyStyle).toHaveBeenCalledTimes(1);
  });

  it('shows all, part or none of the selection as pressed, mixed or not', () => {
    const { editor, element, fire } = stubEditor();
    const root = buildStyleKeys(editor);
    document.body.appendChild(root);
    element.queryStyle.mockReturnValue('all');
    fire('selection-change');
    expect(keys(root)[0]!.getAttribute('aria-pressed')).toBe('true');
    element.queryStyle.mockReturnValue('some');
    fire('selection-change');
    expect(keys(root)[0]!.getAttribute('aria-pressed')).toBe('mixed');
    element.queryStyle.mockReturnValue('none');
    fire('input');
    expect(keys(root)[0]!.getAttribute('aria-pressed')).toBe('false');
  });
});
