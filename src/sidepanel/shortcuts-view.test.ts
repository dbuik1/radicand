// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildShortcutHints } from './shortcuts-view';

describe('keyboard shortcuts reference', () => {
  it('renders the default bindings without chrome.commands', () => {
    const list = buildShortcutHints();
    expect(list.textContent).toContain('Open or close the panel');
    expect(list.textContent).toContain('Ctrl+Shift+U');
    expect(list.textContent).toContain('Show or hide the symbols');
  });

  it('always lists the panel-local shortcuts and the Chrome link', () => {
    const list = buildShortcutHints();
    const rows = Array.from(list.querySelectorAll('.shortcut-list__row')).map(
      (row) => row.querySelector('.shortcut-list__desc')?.textContent,
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        'Copy the equation',
        'Save to library',
        'Search for a symbol',
        'Find a command',
        'Choose from the command list',
        'Insert the highlighted command',
      ]),
    );
    expect(list.querySelector('a')?.textContent).toContain('Change shortcuts in Chrome');
  });
});
