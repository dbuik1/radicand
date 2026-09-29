// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPalette, matrixLatex } from './palette';
import { DEFAULT_SETTINGS, updateSettings } from './settings';
import type { EditorController } from './editor';

function stubEditor(): EditorController & { inserted: string[] } {
  const inserted: string[] = [];
  return {
    inserted,
    element: {} as never,
    getValue: () => '',
    getLatex: () => '',
    getSpokenText: () => '',
    setLatex: () => {},
    insert: (latex: string) => inserted.push(latex),
    isEmpty: () => true,
    focus: () => {},
    onChange: () => () => {},
    setAutoBoxEnabled: () => {},
  };
}

const buttons = (el: ParentNode): HTMLButtonElement[] =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('.palette__btn'));
const tabs = (root: ParentNode): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const panels = (root: ParentNode): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));

describe('symbol palette layout', () => {
  let editor: ReturnType<typeof stubEditor>;
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    editor = stubEditor();
    root = createPalette(editor).root;
    document.body.appendChild(root);
  });

  it('puts Recent first and selected, with its panel a single tab stop', () => {
    const all = tabs(root);
    expect(all[0]!.textContent).toBe('Recent');
    expect(all[0]!.getAttribute('aria-selected')).toBe('true');

    const panelId = all[0]!.getAttribute('aria-controls')!;
    const panel = document.getElementById(panelId)!;
    expect(panel.hidden).toBe(false);
    const tabbable = buttons(panel).filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(buttons(panel).length).toBeGreaterThanOrEqual(4);
  });

  it('exposes categories as a tablist with one selected tab and one visible panel', () => {
    const tablist = root.querySelector('[role="tablist"]');
    expect(tablist?.getAttribute('aria-label')).toBe('Symbol categories');
    // Recent + several categories.
    expect(tabs(root).length).toBeGreaterThanOrEqual(6);

    const selected = tabs(root).filter(
      (t) => t.getAttribute('aria-selected') === 'true',
    );
    expect(selected).toHaveLength(1);

    const visiblePanels = panels(root).filter((p) => !p.hidden);
    expect(visiblePanels).toHaveLength(1);
    expect(visiblePanels[0]!.id).toBe(selected[0]!.getAttribute('aria-controls'));
  });

  it('every symbol button has a meaningful name, not just its glyph', () => {
    for (const b of buttons(root)) {
      const label = b.getAttribute('aria-label') ?? '';
      expect(label.length).toBeGreaterThan(1);
      expect(label).not.toBe(b.textContent);
    }
  });

  it('switches category with ArrowRight and reveals the matching panel', () => {
    const all = tabs(root);
    all[0]!.focus();
    all[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );

    expect(all[0]!.getAttribute('aria-selected')).toBe('false');
    expect(all[1]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(all[1]);

    const panelId = all[1]!.getAttribute('aria-controls')!;
    expect(document.getElementById(panelId)!.hidden).toBe(false);
  });

  it('inserts the mapped LaTeX when a symbol is activated', () => {
    const panelId = tabs(root)[0]!.getAttribute('aria-controls')!;
    const panel = document.getElementById(panelId)!;
    const fraction = buttons(panel).find(
      (b) => b.getAttribute('aria-label') === 'Fraction',
    );
    fraction!.click();
    expect(editor.inserted).toContain('\\frac{#?}{#?}');
  });
});

describe('matrix size picker', () => {
  let editor: ReturnType<typeof stubEditor>;
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    editor = stubEditor();
    root = createPalette(editor).root;
    document.body.appendChild(root);
  });

  it('matrixLatex generates correct LaTeX for given dimensions', () => {
    expect(matrixLatex(2, 3)).toBe(
      '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}',
    );
    expect(matrixLatex(1, 1)).toBe('\\begin{pmatrix}#?\\end{pmatrix}');
  });

  it('opens the popover on trigger click', () => {
    const matrixTab = tabs(root).find((t) => t.textContent === 'Matrix');
    expect(matrixTab).toBeDefined();
    matrixTab!.click();

    const trigger = root.querySelector<HTMLButtonElement>('.matrix-picker__trigger');
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');

    const popover = root.querySelector('.matrix-picker__popover');
    expect(popover!.hasAttribute('hidden')).toBe(true);

    trigger!.click();
    expect(trigger!.getAttribute('aria-expanded')).toBe('true');
    expect(popover!.hasAttribute('hidden')).toBe(false);
  });

  it('clicking a cell selects it, updates inputs, and does not insert', () => {
    const matrixTab = tabs(root).find((t) => t.textContent === 'Matrix');
    matrixTab!.click();

    const trigger = root.querySelector(
      '.matrix-picker__trigger',
    ) as HTMLButtonElement;
    const popover = root.querySelector('.matrix-picker__popover');
    trigger!.click();

    const cells = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.matrix-picker__cell'),
    );
    const cell2x3 = cells.find(
      (c) => c.getAttribute('aria-label') === '2 by 3',
    );
    expect(cell2x3).toBeDefined();
    cell2x3!.click();

    expect(cell2x3!.getAttribute('aria-checked')).toBe('true');

    const rowsInput = root.querySelector('#matrix-rows') as HTMLInputElement;
    const colsInput = root.querySelector('#matrix-cols') as HTMLInputElement;
    expect(rowsInput!.value).toBe('2');
    expect(colsInput!.value).toBe('3');

    expect(editor.inserted).toHaveLength(0);

    expect(popover!.hasAttribute('hidden')).toBe(false);
  });

  it('clicking Insert button inserts the selected size and closes the popover', () => {
    const matrixTab = tabs(root).find((t) => t.textContent === 'Matrix');
    matrixTab!.click();

    const trigger = root.querySelector(
      '.matrix-picker__trigger',
    ) as HTMLButtonElement;
    const popover = root.querySelector('.matrix-picker__popover');
    trigger!.click();

    const cells = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.matrix-picker__cell'),
    );
    const cell2x3 = cells.find(
      (c) => c.getAttribute('aria-label') === '2 by 3',
    );
    cell2x3!.click();

    const insertBtn = root.querySelector(
      '.matrix-picker__manual .btn',
    ) as HTMLButtonElement;
    insertBtn!.click();

    expect(editor.inserted).toContain(matrixLatex(2, 3));

    expect(popover!.hasAttribute('hidden')).toBe(true);
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');
  });

  it('setting Rows/Columns inputs updates selection and Insert uses those values', () => {
    const matrixTab = tabs(root).find((t) => t.textContent === 'Matrix');
    matrixTab!.click();

    const trigger = root.querySelector(
      '.matrix-picker__trigger',
    ) as HTMLButtonElement;
    const popover = root.querySelector('.matrix-picker__popover');
    trigger!.click();

    const rowsInput = root.querySelector('#matrix-rows') as HTMLInputElement;
    const colsInput = root.querySelector('#matrix-cols') as HTMLInputElement;
    rowsInput!.value = '4';
    rowsInput!.dispatchEvent(new Event('input', { bubbles: true }));
    colsInput!.value = '5';
    colsInput!.dispatchEvent(new Event('input', { bubbles: true }));

    const insertBtn = root.querySelector(
      '.matrix-picker__manual .btn',
    ) as HTMLButtonElement;
    insertBtn!.click();

    expect(editor.inserted).toContain(matrixLatex(4, 5));

    expect(popover!.hasAttribute('hidden')).toBe(true);
  });

  it('keeps arrow-key focus inside the picker grid (regression)', () => {
    // The panel-wide roving-tabindex handler used to swallow arrow keys that
    // bubbled out of the picker, yanking focus onto a palette symbol button.
    const matrixTab = tabs(root).find((t) => t.textContent === 'Matrix');
    matrixTab!.click();
    const trigger = root.querySelector(
      '.matrix-picker__trigger',
    ) as HTMLButtonElement;
    trigger!.click();

    const cells = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.matrix-picker__cell'),
    );
    cells[0]!.focus();
    cells[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );

    const active = document.activeElement as HTMLElement;
    expect(active.classList.contains('matrix-picker__cell')).toBe(true);
    expect(active).toBe(cells[1]);
  });

  it('clamps row and column values above 20 down to 20 on Insert', () => {
    const matrixTab = tabs(root).find((t) => t.textContent === 'Matrix');
    matrixTab!.click();

    const trigger = root.querySelector(
      '.matrix-picker__trigger',
    ) as HTMLButtonElement;
    trigger!.click();

    const rowsInput = root.querySelector('#matrix-rows') as HTMLInputElement;
    const colsInput = root.querySelector('#matrix-cols') as HTMLInputElement;
    rowsInput!.value = '99';
    rowsInput!.dispatchEvent(new Event('input', { bubbles: true }));
    colsInput!.value = '50';
    colsInput!.dispatchEvent(new Event('input', { bubbles: true }));

    const insertBtn = root.querySelector(
      '.matrix-picker__manual .btn',
    ) as HTMLButtonElement;
    insertBtn!.click();

    expect(editor.inserted).toContain(matrixLatex(20, 20));
  });
});

describe('symbol palette stored category', () => {
  const selectedTab = (): string | undefined =>
    tabs(document.body).find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent ??
    undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    await updateSettings({ paletteCategory: DEFAULT_SETTINGS.paletteCategory });
  });

  // A category stored by an earlier version that has since been folded into
  // another opens that one, not Recent.
  it('opens Operators for a stored Relations category', async () => {
    await updateSettings({ paletteCategory: 'Relations' });
    document.body.appendChild(createPalette(stubEditor()).root);
    expect(selectedTab()).toBe('Operators');
  });

  it('opens Functions for a stored Calculus category', async () => {
    await updateSettings({ paletteCategory: 'Calculus' });
    document.body.appendChild(createPalette(stubEditor()).root);
    expect(selectedTab()).toBe('Functions');
  });

  // Library is a workspace mode now, so it has no tab to land on.
  it('falls back to Recent for a stored category with no tab', async () => {
    await updateSettings({ paletteCategory: 'Library' });
    document.body.appendChild(createPalette(stubEditor()).root);
    expect(selectedTab()).toBe('Recent');
  });
});
