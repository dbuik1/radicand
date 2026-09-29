// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { createSettingsView } from './settings-view';
import { applyAppearance } from './appearance';
import { getSettings, updateSettings, DEFAULT_SETTINGS, onSettingsChange } from './settings';
import { INTERFACE_PARTS } from './interface-parts';
import { hiddenParts, isPartShown, setPart, showEveryPart } from './part-visibility';

function selectById(root: HTMLElement, id: string): HTMLSelectElement {
  const el = root.querySelector<HTMLSelectElement>(`#${id}`);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function change(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('settings view', () => {
  let view: HTMLElement;

  beforeEach(async () => {
    await showEveryPart();
    document.body.innerHTML = '';
    view = createSettingsView();
    document.body.appendChild(view);
    // Register the listener that normally lives in main.ts boot() to simulate the real app.
    onSettingsChange((next) => applyAppearance(next));
  });

  it('renders labelled controls for every setting', () => {
    for (const id of [
      'set-theme',
      'set-fontsize',
      'set-ruleset',
      'set-verbosity',
    ]) {
      selectById(view, id); // throws when the control is missing
      const label = view.querySelector(`label[for="${id}"]`);
      expect(label?.textContent?.length).toBeGreaterThan(0);
    }
  });

  it('hosts the equation-size slider and number input under Appearance', () => {
    const number = view.querySelector<HTMLInputElement>('#eq-size-number');
    const range = view.querySelector<HTMLInputElement>('.eq-size__range');
    expect(number).toBeTruthy();
    expect(range).toBeTruthy();
    expect(view.querySelector('label[for="eq-size-number"]')?.textContent).toBe('Equation size');
    expect(number!.closest('fieldset')?.querySelector('legend')?.textContent).toBe('Appearance');

    number!.value = '150';
    number!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getSettings().equationScale).toBe(1.5);
    expect(range!.value).toBe('150');
  });

  it('is a plain form: the workspace mode supplies the heading and Close', () => {
    expect(view.tagName).toBe('DIV');
    expect(view.querySelector('summary')).toBeNull();
    expect(view.textContent).not.toContain('Keyboard shortcuts');
  });

  it('persists and live-applies a theme change', () => {
    change(selectById(view, 'set-theme'), 'high-contrast');
    expect(getSettings().theme).toBe('high-contrast');
    expect(document.documentElement.dataset.theme).toBe('high-contrast');
  });

  it('maps the font-size choice to a numeric scale (root 18px × multiplier)', () => {
    change(selectById(view, 'set-fontsize'), String(24 / 18));
    expect(getSettings().fontScale).toBe(24 / 18);
  });

  it('syncs its controls when settings change elsewhere', async () => {
    await updateSettings({ theme: 'dark' });
    expect(selectById(view, 'set-theme').value).toBe('dark');
  });

  it('renders the auto-fit checkbox, defaulting to the setting value', () => {
    const input = view.querySelector<HTMLInputElement>('#set-auto-fit');
    const label = view.querySelector('label[for="set-auto-fit"]');
    expect(input).toBeTruthy();
    expect(input?.type).toBe('checkbox');
    expect(input?.checked).toBe(DEFAULT_SETTINGS.autoFit);
    expect(label?.textContent?.length).toBeGreaterThan(0);
  });

  it('toggles autoFit and syncs when changed elsewhere', async () => {
    const input = view.querySelector<HTMLInputElement>('#set-auto-fit')!;
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getSettings().autoFit).toBe(false);

    await updateSettings({ autoFit: true });
    expect(input.checked).toBe(true);
  });

  it('offers one checkbox per piece of interface, labelled and described', () => {
    for (const spec of INTERFACE_PARTS) {
      const input = view.querySelector<HTMLInputElement>(`#set-part-${spec.part}`);
      const label = view.querySelector(`label[for="set-part-${spec.part}"]`);
      const hint = view.querySelector(`#set-part-${spec.part}-hint`);
      expect(input?.type).toBe('checkbox');
      expect(input?.checked).toBe(true);
      expect(label?.textContent).toBe(spec.label);
      expect(hint?.textContent).toBe(spec.hint);
      expect(input?.getAttribute('aria-describedby')).toBe(`set-part-${spec.part}-hint`);
      // The checkbox and its heading share one row, like every other
      // checkbox in the form, rather than the heading dropping below it.
      expect(input?.parentElement?.classList.contains('field__row')).toBe(true);
      expect(label?.closest('.field__row')).toBe(input?.parentElement);
    }
  });

  it('switches a piece off and back on from its checkbox', async () => {
    const input = view.querySelector<HTMLInputElement>('#set-part-speak')!;
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(isPartShown('speak')).toBe(false);

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(isPartShown('speak')).toBe(true);
  });

  it('syncs the checkboxes when a piece is switched off elsewhere', async () => {
    await setPart('copy', false);
    expect(view.querySelector<HTMLInputElement>('#set-part-copy')!.checked).toBe(false);
    await showEveryPart();
    expect(view.querySelector<HTMLInputElement>('#set-part-copy')!.checked).toBe(true);
  });

  it('offers "Show every piece" only while something is hidden', async () => {
    const restore = view.querySelector<HTMLButtonElement>('#set-parts-restore')!;
    expect(restore.disabled).toBe(true);

    await setPart('source', false);
    expect(restore.disabled).toBe(false);

    restore.click();
    await Promise.resolve();
    expect(hiddenParts()).toEqual([]);
    expect(restore.disabled).toBe(true);
  });

  it('does not offer the equation field: it is always on screen', () => {
    expect(view.querySelector('#set-part-field')).toBeNull();
    expect(view.querySelector('#equation-editor')).toBeNull();
  });
});
