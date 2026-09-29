// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMenu } from './menu';

/**
 * The shared menu button against happy-dom: ARIA wiring, open/close paths,
 * focus movement and the checked-state sync. The real panel menus (Style,
 * More, Copy format) are exercised end to end in tests/ext/run.mjs.
 */
function build(overrides: Partial<Parameters<typeof createMenu>[0]> = {}) {
  const first = vi.fn();
  const second = vi.fn();
  let checked = false;
  const controller = createMenu({
    id: 'test',
    label: 'Style',
    entries: [
      { label: 'Bold', shortcut: 'Ctrl+B', kind: 'checkbox', checked: () => checked, onSelect: first },
      { kind: 'separator' },
      { label: 'Settings', onSelect: second, focusAfter: 'none' },
    ],
    ...overrides,
  });
  document.body.appendChild(controller.root);
  return { controller, first, second, setChecked: (v: boolean) => (checked = v) };
}

function key(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('menu button', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
  });

  it('wires the trigger and list with the menu-button ARIA contract', () => {
    const { controller } = build();
    const { trigger, menu } = controller;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(trigger.textContent).toContain('Style');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(menu.hidden).toBe(true);

    const items = Array.from(menu.querySelectorAll('button'));
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('role')).toBe('menuitemcheckbox');
    expect(items[0]!.getAttribute('aria-keyshortcuts')).toBe('Ctrl+B');
    expect(items[0]!.tabIndex).toBe(-1);
    expect(items[1]!.getAttribute('role')).toBe('menuitem');
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
  });

  it('opens on click, focusing the first item, and syncs checked states', () => {
    const { controller, setChecked } = build();
    setChecked(true);
    controller.trigger.click();
    expect(controller.isOpen()).toBe(true);
    expect(controller.menu.hidden).toBe(false);
    expect(controller.trigger.getAttribute('aria-expanded')).toBe('true');
    const [bold] = Array.from(controller.menu.querySelectorAll('button'));
    expect(document.activeElement).toBe(bold);
    expect(bold!.getAttribute('aria-checked')).toBe('true');
  });

  it('moves with the arrow keys (wrapping), Home and End', () => {
    const { controller } = build();
    controller.open();
    const [bold, settings] = Array.from(controller.menu.querySelectorAll('button'));
    key(controller.menu, 'ArrowDown');
    expect(document.activeElement).toBe(settings);
    key(controller.menu, 'ArrowDown');
    expect(document.activeElement).toBe(bold);
    key(controller.menu, 'ArrowUp');
    expect(document.activeElement).toBe(settings);
    key(controller.menu, 'Home');
    expect(document.activeElement).toBe(bold);
    key(controller.menu, 'End');
    expect(document.activeElement).toBe(settings);
  });

  it('opens from the trigger with ArrowUp to the last item', () => {
    const { controller } = build();
    key(controller.trigger, 'ArrowUp');
    const items = Array.from(controller.menu.querySelectorAll('button'));
    expect(controller.isOpen()).toBe(true);
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { controller } = build();
    controller.open();
    key(controller.menu, 'Escape');
    expect(controller.isOpen()).toBe(false);
    expect(controller.menu.hidden).toBe(true);
    expect(controller.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(controller.trigger);
  });

  it('activates an item, closes, and honours the focus policy', () => {
    const { controller, first, second } = build();
    controller.open();
    const [bold, settings] = Array.from(controller.menu.querySelectorAll('button'));
    bold!.click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(controller.isOpen()).toBe(false);
    expect(document.activeElement).toBe(controller.trigger);

    controller.open();
    settings!.click();
    expect(second).toHaveBeenCalledTimes(1);
    expect(controller.isOpen()).toBe(false);
    // focusAfter: 'none' – the handler owns focus, the trigger is not refocused.
    expect(document.activeElement).not.toBe(controller.trigger);
  });

  it('closes on a pointer press outside without stealing focus', () => {
    const { controller } = build();
    const other = document.createElement('button');
    document.body.appendChild(other);
    controller.open();
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    other.focus();
    expect(controller.isOpen()).toBe(false);
    expect(document.activeElement).toBe(other);
  });

  it('jumps to an item by its first letter', () => {
    const { controller } = build();
    controller.open();
    const [, settings] = Array.from(controller.menu.querySelectorAll('button'));
    key(controller.menu, 's');
    expect(document.activeElement).toBe(settings);
  });

  describe('placement inside the viewport', () => {
    /** Lay the list out at `left`, 200px wide, in a 400px window. */
    function layout(controller: ReturnType<typeof createMenu>, left: number) {
      vi.stubGlobal('innerWidth', 400);
      controller.menu.getBoundingClientRect = () =>
        ({ left, right: left + 200, width: 200, height: 100 }) as DOMRect;
    }

    it('leaves a list that fits where it is', () => {
      const { controller } = build({ align: 'end' });
      layout(controller, 150);
      controller.open();
      expect(controller.menu.style.transform).toBe('');
    });

    it('shifts a list that would leave the right edge back in', () => {
      const { controller } = build();
      layout(controller, 300);
      controller.open();
      expect(controller.menu.style.transform).toBe('translateX(-108px)');
    });

    it('shifts a list that would leave the left edge back in', () => {
      const { controller } = build({ align: 'end' });
      layout(controller, -97);
      controller.open();
      expect(controller.menu.style.transform).toBe('translateX(105px)');
    });

    it('re-measures on every open', () => {
      const { controller } = build();
      layout(controller, 300);
      controller.open();
      expect(controller.menu.style.transform).toBe('translateX(-108px)');
      controller.close();
      layout(controller, 100);
      controller.open();
      expect(controller.menu.style.transform).toBe('');
    });
  });
});
