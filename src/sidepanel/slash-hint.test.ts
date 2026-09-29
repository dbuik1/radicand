// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installSlashFractionHint } from './slash-hint';
import { getSettings, updateSettings } from './settings';
import type { EditorController } from './editor';

function mount() {
  document.body.innerHTML = '<div id="sr-status"></div><div class="editor-field"></div>';
  const host = document.querySelector<HTMLElement>('.editor-field')!;
  const field = document.createElement('div');
  field.tabIndex = 0;
  host.appendChild(field);
  const editor = { element: field, focus: () => field.focus() } as unknown as EditorController;
  const openSettings = vi.fn();
  installSlashFractionHint(editor, host, { openSettings });
  return { host, field, openSettings };
}

const press = (target: EventTarget, key: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

const hint = (): HTMLElement | null => document.querySelector<HTMLElement>('.slash-hint');
const announced = (): Promise<string> =>
  new Promise((resolve) =>
    requestAnimationFrame(() => resolve(document.getElementById('sr-status')?.textContent ?? '')),
  );

describe('slash-fraction hint', () => {
  beforeEach(async () => {
    await updateSettings({ slashFraction: true, slashHintShown: false });
  });

  it('shows once, above the field, and remembers that it has been shown', async () => {
    const { host, field } = mount();
    press(field, '/');
    expect(hint()).not.toBeNull();
    expect(host.firstElementChild).toBe(hint());
    expect(hint()?.getAttribute('role')).toBe('status');
    expect(hint()?.getAttribute('aria-live')).toBe('off');
    expect(getSettings().slashHintShown).toBe(true);
    expect(await announced()).toContain('Typing / built a fraction');

    hint()?.remove();
    press(field, '/');
    expect(hint()).toBeNull();
    expect(document.querySelectorAll('.slash-hint').length).toBe(0);
  });

  it('stays quiet while the slash-fraction setting is off', async () => {
    await updateSettings({ slashFraction: false });
    const { field } = mount();
    press(field, '/');
    expect(hint()).toBeNull();
    expect(getSettings().slashHintShown).toBe(false);
  });

  it('opens Settings from its own button, naming the button as the opener', () => {
    const { field, openSettings } = mount();
    press(field, '/');
    const button = Array.from(hint()!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Open Settings',
    )!;
    button.click();
    expect(openSettings).toHaveBeenCalledWith(button);
    expect(hint()).not.toBeNull();
  });

  it('Dismiss removes it and returns focus to the field', () => {
    const { field } = mount();
    press(field, '/');
    const dismiss = hint()!.querySelector<HTMLButtonElement>('[aria-label="Dismiss this hint"]')!;
    dismiss.focus();
    dismiss.click();
    expect(hint()).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it('Escape in the field dismisses it without touching the field', () => {
    const { field } = mount();
    press(field, '/');
    field.focus();
    press(field, 'Escape');
    expect(hint()).toBeNull();
    expect(document.activeElement).toBe(field);
  });
});
