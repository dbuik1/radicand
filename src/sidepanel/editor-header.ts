/**
 * Zone A's header row: the "Equation" heading on the left, the Style ▾ and
 * More ▾ menus on the right.
 *
 * The heading is the equation field's accessible name, so switching it off
 * hides it from the screen only (see interface-parts.ts). With the heading
 * and both menus switched off there is nothing left in the row, and it gives
 * up its padding rather than leaving a band of empty space above the field.
 */
import type { EditorController } from './editor';
import { createStyleMenu } from './style-menu';
import { createMoreMenu } from './more-menu';
import type { MoreMenuHooks } from './more-menu';
import type { Workspace } from './workspace';
import { bindPart, bindToSettings, isPartShown } from './part-visibility';

export interface EditorHeader {
  /** The header row; mount this above the field. */
  root: HTMLElement;
  /** The heading, which also names the field (`aria-labelledby`). */
  label: HTMLElement;
  /** Build the menus, once the field they read exists. */
  mountMenus: (
    editor: EditorController,
    getWorkspace: () => Workspace | undefined,
    more: MoreMenuHooks,
  ) => void;
}

export function createEditorHeader(): EditorHeader {
  const label = document.createElement('h2');
  label.className = 'editor-title';
  label.id = 'editor-label';
  label.textContent = 'Equation';
  bindPart('equationHeading', label);

  const root = document.createElement('div');
  root.className = 'editor-header';

  const menus = document.createElement('div');
  menus.className = 'editor-header__menus';
  root.append(label, menus);

  bindToSettings(() => {
    const empty =
      !isPartShown('equationHeading') && !isPartShown('styleMenu') && !isPartShown('moreMenu');
    root.classList.toggle('editor-header--empty', empty);
  });

  const mountMenus = (
    editor: EditorController,
    getWorkspace: () => Workspace | undefined,
    hooks: MoreMenuHooks,
  ): void => {
    const style = createStyleMenu(editor).root;
    bindPart('styleMenu', style);
    const more = createMoreMenu(getWorkspace, hooks).root;
    bindPart('moreMenu', more);
    menus.append(style, more);
  };

  return { root, label, mountMenus };
}
