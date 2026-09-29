// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createWorkspace } from './workspace';
import type { Workspace } from './workspace';
import { setPart } from './part-visibility';
import type { EditorController } from './editor';

function stubEditor(): EditorController & { focused: number } {
  const element = document.createElement('div');
  element.tabIndex = 0;
  const editor = {
    focused: 0,
    element: element as unknown as EditorController['element'],
    getValue: () => '',
    getLatex: () => '',
    getSpokenText: () => '',
    setLatex: () => {},
    insert: () => {},
    isEmpty: () => true,
    focus: () => {
      editor.focused += 1;
      element.focus();
    },
    onChange: () => () => {},
    setAutoBoxEnabled: () => {},
  };
  return editor;
}

const announced = (): Promise<string> =>
  new Promise((resolve) =>
    requestAnimationFrame(() => resolve(document.getElementById('sr-status')?.textContent ?? '')),
  );

describe('workspace: the symbols flag', () => {
  let workspace: Workspace;
  let editor: ReturnType<typeof stubEditor>;
  const palette = (): HTMLElement => workspace.root.querySelector<HTMLElement>('#symbols')!;
  const settingsSection = (): HTMLElement | null =>
    workspace.root.querySelector<HTMLElement>('.mode--settings');

  // One workspace for the suite: the views it builds subscribe to settings
  // with no unsubscribe, so a fresh one per test would leave the old ones
  // listening.
  beforeAll(() => {
    document.body.innerHTML = '<div id="sr-status"></div>';
    editor = stubEditor();
    document.body.appendChild(editor.element);
    workspace = createWorkspace(editor);
    document.body.appendChild(workspace.root);
  });

  beforeEach(async () => {
    workspace.close('none');
    await setPart('symbols', true);
    document.getElementById('sr-status')!.textContent = '';
    editor.focused = 0;
  });

  it('hides and reveals the palette with its flag', async () => {
    await setPart('symbols', false);
    expect(palette().hidden).toBe(true);
    await setPart('symbols', true);
    expect(palette().hidden).toBe(false);
    expect(document.getElementById('symbol-search-input')?.closest('[hidden]')).toBeNull();
  });

  it('leaves an open mode alone, so nobody is thrown out of Settings mid-tick', async () => {
    workspace.open('settings');
    await setPart('symbols', false);
    expect(workspace.current()).toBe('settings');
    expect(settingsSection()?.hidden).toBe(false);
    expect(palette().hidden).toBe(true);
  });

  it('shows the change as soon as the mode closes', async () => {
    workspace.open('settings');
    await setPart('symbols', false);
    workspace.close('field');
    expect(settingsSection()?.hidden).toBe(true);
    expect(palette().hidden).toBe(true);
  });

  it('says nothing itself: the announcement belongs to part-visibility', async () => {
    await setPart('symbols', false);
    expect(await announced()).toBe('');
  });
});
