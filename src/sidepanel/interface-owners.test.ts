// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createActionsBar } from './actions-bar';
import { createEditorHeader } from './editor-header';
import { createSourceView } from './source';
import { createWorkspace } from './workspace';
import type { Workspace } from './workspace';
import { INTERFACE_PARTS } from './interface-parts';
import { setPart, showEveryPart } from './part-visibility';
import type { EditorController } from './editor';
import type { InterfacePart } from '../types';

function stubEditor(): EditorController {
  // Enough of a mathfield for the text style keys to read a state from.
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
let workspace: Workspace;

const OWNED: { part: InterfacePart; find: () => HTMLElement | null }[] = [
  { part: 'equationHeading', find: () => query('#editor-label') },
  { part: 'symbols', find: () => query('#symbols-content') },
  { part: 'symbolSearch', find: () => query('#symbol-search-input') },
  { part: 'symbolCategories', find: () => query('.palette__tabs') },
  { part: 'source', find: () => query('details.source') },
  { part: 'copy', find: () => query('.actions-bar__status') },
  { part: 'speak', find: () => query('.actions-bar > button.btn--secondary') },
  {
    part: 'saveToLibrary',
    find: () => {
      workspace.open('library', undefined, false);
      const button = query('.library-save');
      return button;
    },
  },
];

describe('every piece of interface has an owner that switches it off', () => {
  beforeEach(async () => {
    await showEveryPart();
    document.body.innerHTML = '<div id="sr-status"></div>';
    const editor = stubEditor();

    document.body.appendChild(createEditorHeader().root);
    document.body.appendChild(createActionsBar(editor));
    // The Library tab is built on first use; Save to library lives in it.
    workspace = createWorkspace(editor, { onSearch: () => {} });
    document.body.appendChild(workspace.root);
    document.body.appendChild(createSourceView(editor));
  });

  afterEach(async () => {
    await showEveryPart();
  });

  it('starts with everything on screen', () => {
    for (const { part, find } of OWNED) {
      workspace.showSymbols();
      expect(gone(find()), part).toBe(false);
    }
  });

  it.each(OWNED)('takes $part off screen and brings it back', async ({ part, find }) => {
    workspace.showSymbols();
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
    expect(palette()?.hidden).toBe(false);
    await setPart('symbolCategories', false);
    expect(palette()?.hidden).toBe(true);
  });

  it('hides the actions bar once copy and read aloud are both off', async () => {
    await setPart('copy', false);
    expect(query('.actions-bar')?.hidden).toBe(false);
    await setPart('speak', false);
    expect(query('.actions-bar')?.hidden).toBe(true);
  });
});
