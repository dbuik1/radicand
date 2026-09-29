// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStyleMenu } from './style-menu';
import type { EditorController } from './editor';

/**
 * Style menu behaviour against a scripted mathfield stub: applyStyle calls,
 * tri-state aria-checked from queryStyle, and the selection round trip. The
 * real MathLive interplay (arming, toggling, empty-field pending) is covered
 * by tests/e2e/specs/styling.spec.mjs against a live field, and the menu
 * itself by menu.test.ts.
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

describe('style menu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
  });

  it('is a Style menu button of six named checkable items', () => {
    const { editor } = stubEditor();
    const menu = createStyleMenu(editor);
    document.body.appendChild(menu.root);

    expect(menu.trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(menu.trigger.textContent).toContain('Style');
    const items = Array.from(menu.menu.querySelectorAll('[role="menuitemcheckbox"]'));
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.querySelector('.menu__label')!.textContent)).toEqual([
      'Bold',
      'Italic',
      'Upright',
      'Blackboard bold',
      'Calligraphic',
      'Fraktur (German)',
    ]);
    expect(items[0]!.getAttribute('aria-keyshortcuts')).toBe('Control+B');
    for (const item of items) expect(item.getAttribute('aria-checked')).toBe('false');
  });

  it('applies the style to the saved selection and returns focus to the field', () => {
    const { editor, element, applyStyle, focus } = stubEditor();
    const menu = createStyleMenu(editor);
    document.body.appendChild(menu.root);

    menu.trigger.click();
    element.selection = { ranges: [[0, 0]] }; // the field moved on (it would not, but prove the restore)
    const [bold] = Array.from(menu.menu.querySelectorAll<HTMLButtonElement>('button'));
    bold!.click();

    expect(focus).toHaveBeenCalled();
    expect(element.selection).toEqual({ ranges: [[0, 1]] });
    expect(applyStyle).toHaveBeenCalledWith({ variantStyle: 'bold' }, { operation: 'toggle' });
    expect(menu.isOpen()).toBe(false);
  });

  it('reflects queryStyle as a tri-state aria-checked', () => {
    const { editor, element, fire } = stubEditor();
    const menu = createStyleMenu(editor);
    document.body.appendChild(menu.root);
    const [bold] = Array.from(menu.menu.querySelectorAll('button'));

    (element.queryStyle as ReturnType<typeof vi.fn>).mockReturnValue('all');
    fire('selection-change');
    expect(bold!.getAttribute('aria-checked')).toBe('true');

    (element.queryStyle as ReturnType<typeof vi.fn>).mockReturnValue('some');
    fire('selection-change');
    expect(bold!.getAttribute('aria-checked')).toBe('mixed');
  });
});
