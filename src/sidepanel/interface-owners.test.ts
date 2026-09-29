// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createActionsBar } from './actions-bar';
import { createEditorHeader } from './editor-header';
import { createPalette } from './palette';
import { createSourceView } from './source';
import { INTERFACE_PARTS } from './interface-parts';
import { setPart, showEveryPart } from './part-visibility';
import type { EditorController } from './editor';
import type { InterfacePart } from '../types';

function stubEditor(): EditorController {
  // Enough of a mathfield for the Style ▾ menu to read a state from.
  const element = Object.assign(document.createElement('div'), {
    applyStyle: () => {},
    queryStyle: () => 'none',
    getValue: () => 'x',
    selection: { ranges: [[0, 1]] },
    position: 0,
  });
  return {
    element: element as unknown as EditorController['element'],
    getValue: () => '',
    getLatex: () => '',
    getSpokenText: () => '',
    setLatex: () => {},
    insert: () => {},
    isEmpty: () => true,
    focus: () => {},
    onChange: () => () => {},
    setAutoBoxEnabled: () => {},
  };
}

/** Is `el` off screen – itself hidden, or inside something hidden? */
const gone = (el: HTMLElement | null): boolean => {
  if (!el) throw new Error('missing element');
  return el.hidden || el.closest('[hidden]') !== null || el.classList.contains('visually-hidden');
};

const query = (selector: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(selector);

/**
 * Every part, the element it is meant to take off screen, and where that
 * element is built. A part with no row here has no owner, and the last test
 * in this file says so.
 */
const OWNED: { part: InterfacePart; find: () => HTMLElement | null }[] = [
  { part: 'equationHeading', find: () => query('#editor-label') },
  { part: 'styleMenu', find: () => query('#style-trigger') },
  { part: 'moreMenu', find: () => query('#more-trigger') },
  { part: 'symbols', find: () => query('#symbols-content') },
  { part: 'symbolSearch', find: () => query('#symbol-search-input') },
  { part: 'symbolCategories', find: () => query('.palette__tabs') },
  { part: 'symbolSources', find: () => query('.from-buttons') },
  { part: 'source', find: () => query('details.source') },
  { part: 'copy', find: () => query('.actions-bar__status') },
  { part: 'speak', find: () => query('.actions-bar button.btn--secondary') },
  { part: 'saveToLibrary', find: () => query('#save-to-library') },
];

describe('every piece of interface has an owner that switches it off', () => {
  beforeEach(async () => {
    await showEveryPart();
    document.body.innerHTML = '<div id="sr-status"></div>';
    const editor = stubEditor();

    const header = createEditorHeader();
    header.mountMenus(editor, () => undefined, { searchSymbols: () => {} });
    document.body.appendChild(header.root);
    document.body.appendChild(createPalette(editor).root);
    document.body.appendChild(createSourceView(editor));

    const save = document.createElement('button');
    save.type = 'button';
    save.id = 'save-to-library';
    save.textContent = 'Save to library';
    document.body.appendChild(createActionsBar(editor, save));
  });

  afterEach(async () => {
    await showEveryPart();
  });

  it('starts with everything on screen', () => {
    for (const { part, find } of OWNED) {
      expect(gone(find()), part).toBe(false);
    }
  });

  it.each(OWNED)('takes $part off screen and brings it back', async ({ part, find }) => {
    await setPart(part, false);
    expect(gone(find())).toBe(true);
    await setPart(part, true);
    expect(gone(find())).toBe(false);
  });

  it('covers every part in the table, so none can be switched off with no effect', () => {
    expect(OWNED.map((row) => row.part).sort()).toEqual(
      INTERFACE_PARTS.map((spec) => spec.part).sort(),
    );
  });

  it('never hides the equation field, whatever is switched off', async () => {
    const field = document.createElement('div');
    field.id = 'equation-editor';
    document.body.appendChild(field);
    for (const spec of INTERFACE_PARTS) await setPart(spec.part, false);
    expect(gone(field)).toBe(false);
  });

  it('collapses the palette once everything inside it is off', async () => {
    const palette = () => query('#symbols');
    await setPart('symbolSearch', false);
    await setPart('symbolSources', false);
    expect(palette()?.hidden).toBe(false);
    await setPart('symbolCategories', false);
    expect(palette()?.hidden).toBe(true);
  });

  it('collapses the search row once the box and the From controls are both off', async () => {
    await setPart('symbolSearch', false);
    expect(query('.symbol-search')?.hidden).toBe(false);
    await setPart('symbolSources', false);
    expect(query('.symbol-search')?.hidden).toBe(true);
  });

  it('collapses the header row and the actions bar once each is empty', async () => {
    await setPart('equationHeading', false);
    await setPart('styleMenu', false);
    await setPart('moreMenu', false);
    expect(query('.editor-header')?.classList.contains('editor-header--empty')).toBe(true);

    await setPart('copy', false);
    await setPart('speak', false);
    await setPart('saveToLibrary', false);
    expect(query('.actions-bar')?.hidden).toBe(true);
  });
});
