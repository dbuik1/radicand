// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EditorController } from './editor';

/**
 * My library and the capture flow against the real (in-memory) store and
 * a stub editor: the contract is that a keyboard-only user can save,
 * find, insert, rename and delete without a pointer. Previews render
 * eagerly here (happy-dom has no IntersectionObserver) through the real
 * MathLive markup path.
 */
function stubEditor() {
  const insert = vi.fn();
  const focus = vi.fn();
  const element = {
    selectionIsCollapsed: true,
    selection: {},
    getValue: () => '',
    focus,
  };
  const editor = {
    insert,
    focus,
    element,
    isEmpty: () => false,
    getLatex: () => 'x+1',
    getSpokenText: () => 'x plus 1',
  } as unknown as EditorController;
  return { editor, insert, focus, element };
}

async function freshModules() {
  vi.resetModules();
  vi.stubGlobal('chrome', undefined);
  const library = await import('./library');
  const view = await import('./library-view');
  const capture = await import('./library-capture');
  return { library, view, capture };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('library view', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('lists saved entries as [Insert][Edit] rows and inserts on activation', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Pythagoras', body: 'a^2+b^2=c^2' });
    const { editor, insert } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    const insertBtn = panel.querySelector<HTMLButtonElement>('.library-row__insert')!;
    expect(insertBtn.getAttribute('aria-label')).toBe('Pythagoras');
    // The row is the name over its preview, with the trigger in its own
    // right-hand slot – never folded into the name.
    expect(insertBtn.querySelector('.library-row__text .library-row__name')!.textContent).toBe(
      'Pythagoras',
    );
    expect(insertBtn.querySelector('.library-row__text .library-row__preview')).not.toBeNull();
    expect(insertBtn.querySelector('.library-row__trigger')).toBeNull();
    insertBtn.click(); // detail 0 = keyboard: insert without moving focus
    expect(insert).toHaveBeenCalledWith('a^2+b^2=c^2', { focus: false });
    expect(library.getLibraryEntries()[0]!.uses).toBe(1);
  });

  it('renames through the Edit form', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Old name', body: 'x' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    panel.querySelector<HTMLButtonElement>('.library-row__edit')!.click();
    const form = panel.querySelector<HTMLFormElement>('.library-form')!;
    const name = form.querySelector<HTMLInputElement>('input')!;
    name.value = 'New name';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(library.getLibraryEntries()[0]!.name).toBe('New name');
    // The row rebuilt with the new name.
    expect(
      panel.querySelector('.library-row__insert')!.getAttribute('aria-label'),
    ).toBe('New name');
  });

  it('requires a second press to delete, then offers a working undo', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Keep me', body: 'x' });
    const savedId = library.getLibraryEntries()[0]!.id;
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    panel.querySelector<HTMLButtonElement>('.library-row__edit')!.click();
    const del = [...panel.querySelectorAll('button')].find((button) =>
      button.textContent!.startsWith('Delete'),
    )!;
    // Both states of the confirmation name what is deleted.
    expect(del.textContent).toBe('Delete "Keep me"');
    del.click();
    expect(library.getLibraryEntries()).toHaveLength(1); // armed, not deleted
    expect(del.textContent).toContain('Keep me');
    expect(del.textContent).toContain('press again');
    del.click();
    expect(library.getLibraryEntries()).toHaveLength(0);

    const undo = [...panel.querySelectorAll('button')].find((button) =>
      button.textContent!.startsWith('Undo delete'),
    )!;
    expect(undo.hidden).toBe(false);
    undo.focus();
    undo.click();
    expect(library.getLibraryEntries()).toHaveLength(1);
    expect(library.getLibraryEntries()[0]!.id).toBe(savedId);
    expect(undo.hidden).toBe(true);
    // Focus moves to the restored row before the Undo button is hidden.
    const restoredRow = panel.querySelector<HTMLElement>('.library-row')!;
    expect(restoredRow.dataset['id']).toBe(savedId);
    expect(document.activeElement).toBe(restoredRow.querySelector('.library-row__insert'));
  });

  it('keeps focus on the Insert button across consecutive keyboard inserts', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'First', body: 'a' });
    library.addLibraryEntry({ name: 'Second', body: 'b' });
    const { editor, insert } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    const insertBtn = panel.querySelector<HTMLButtonElement>(
      '.library-row__insert[aria-label="Second"]',
    )!;
    insertBtn.focus();
    insertBtn.click();
    expect(insert).toHaveBeenCalledTimes(1);
    // A use count moving does not rebuild the list: the same button stays
    // connected, focused, and ready for the next Enter.
    expect(insertBtn.isConnected).toBe(true);
    expect(document.activeElement).toBe(insertBtn);
    insertBtn.click();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenLastCalledWith('b', { focus: false });
  });

  it('applies a deferred Recently used reorder when the panel is refreshed', async () => {
    const { library, view } = await freshModules();
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 2));
    library.addLibraryEntry({ name: 'First', body: 'a' });
    await tick(); // distinct timestamps, so "Recently used" has a definite order
    library.addLibraryEntry({ name: 'Second', body: 'b' });
    await tick();
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor);
    document.body.appendChild(panel.element);
    const names = () =>
      [...panel.element.querySelectorAll('.library-row__insert')].map((button) =>
        button.getAttribute('aria-label'),
      );
    expect(names()).toEqual(['Second', 'First']);
    panel.element.querySelector<HTMLButtonElement>('.library-row__insert[aria-label="First"]')!.click();
    expect(names()).toEqual(['Second', 'First']); // unchanged while in use
    panel.refresh();
    expect(names()).toEqual(['First', 'Second']);
  });

  it('keeps focus on the same entry when the list is rebuilt around it', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'First', body: 'a' });
    library.addLibraryEntry({ name: 'Second', body: 'b' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    const rows = panel.querySelectorAll<HTMLElement>('.library-row');
    const secondId = rows[1]!.dataset['id']!;
    rows[1]!.querySelector<HTMLButtonElement>('.library-row__edit')!.focus();
    library.addLibraryEntry({ name: 'Third', body: 'c' }); // a content change rebuilds
    const active = document.activeElement as HTMLElement;
    expect(active.classList.contains('library-row__edit')).toBe(true);
    expect(active.closest<HTMLElement>('.library-row')!.dataset['id']).toBe(secondId);
    expect(active.tabIndex).toBe(0); // and it is the list's Tab stop
  });

  it('returns focus to the row after Save changes', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Old name', body: 'x' });
    const { editor, focus } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    panel.querySelector<HTMLButtonElement>('.library-row__edit')!.click();
    const form = panel.querySelector<HTMLFormElement>('.library-form')!;
    const name = form.querySelector<HTMLInputElement>('input')!;
    name.value = 'New name';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(panel.querySelector('.library-form')).toBeNull();
    expect(document.activeElement).toBe(panel.querySelector('.library-row__edit'));
    expect(focus).not.toHaveBeenCalled(); // the equation field is not the fallback
  });

  it('announces how many formulae match once typing in the filter pauses', async () => {
    const { library, view } = await freshModules();
    const status = document.createElement('div');
    status.id = 'sr-status';
    document.body.appendChild(status);
    library.addLibraryEntry({ name: 'Quadratic formula', body: 'x' });
    library.addLibraryEntry({ name: 'Std dev', body: 'y', keywords: 'variance; spread' });
    const { editor } = stubEditor();
    document.body.appendChild(view.buildLibraryPanel(editor).element);

    const filter = document.querySelector<HTMLInputElement>('#library-filter')!;
    filter.value = 'Quad';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(status.textContent).toBe('1 of 2 formulae'), {
      timeout: 2000,
    });
    filter.value = 'zzz';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(status.textContent).toBe('No formulae match – clear the filter to see all 2'), {
      timeout: 2000,
    });
  });

  it('offers a category filter only once an entry has a category, combined with the search', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Quadratic formula', body: 'x', category: 'Algebra' });
    library.addLibraryEntry({ name: 'Std dev', body: 'y', category: 'Statistics' });
    library.addLibraryEntry({ name: 'Mean', body: 'z', category: 'Statistics' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    const select = panel.querySelector<HTMLSelectElement>('#library-category')!;
    expect(select.hidden).toBe(false);
    expect(document.querySelector('label[for="library-category"]')!.textContent).toBe('Category');
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'All categories',
      'Algebra',
      'Statistics',
    ]);
    expect(panel.querySelectorAll('.library-row')).toHaveLength(3);

    select.value = 'statistics';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(panel.querySelectorAll('.library-row')).toHaveLength(2);

    const filter = panel.querySelector<HTMLInputElement>('#library-filter')!;
    filter.value = 'mean';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect(panel.querySelectorAll('.library-row')).toHaveLength(1);

    filter.value = 'quad';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expect(panel.querySelectorAll('.library-row')).toHaveLength(0);
    expect(panel.querySelector('.palette__empty')!.textContent).toBe(
      'No formulae match – clear the filters to see all 3',
    );

    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(panel.querySelectorAll('.library-row')).toHaveLength(1);
  });

  it('keeps the category filter hidden while no entry has a category', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Quadratic formula', body: 'x' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);
    expect(panel.querySelector<HTMLSelectElement>('#library-category')!.hidden).toBe(true);
  });

  it('filters by name and keywords', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Quadratic formula', body: 'x' });
    library.addLibraryEntry({ name: 'Std dev', body: 'y', keywords: 'variance; spread' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);
    expect(panel.querySelectorAll('.library-row')).toHaveLength(2);

    const filter = panel.querySelector<HTMLInputElement>('#library-filter')!;
    filter.value = 'variance';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = panel.querySelectorAll('.library-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.querySelector('.library-row__insert')!.getAttribute('aria-label')).toBe(
      'Std dev',
    );
  });

  it('replace on import requires a second press and offers an export first', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Existing', body: 'e' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    // Feed a real file through the hidden input's change path.
    const json = JSON.stringify({
      version: 1,
      entries: [{ id: 'n', name: 'New', body: 'n', uses: 0 }],
    });
    const fileInput = panel.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(fileInput.hidden).toBe(true);
    Object.defineProperty(fileInput, 'files', {
      value: [new File([json], 'library.json', { type: 'application/json' })],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      if (!panel.querySelector('input[type="radio"]')) throw new Error('options not open');
    });

    const replace = [...panel.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (radio) => radio.value === 'replace',
    )!;
    replace.click();
    replace.dispatchEvent(new Event('change', { bubbles: true }));
    const exportFirst = [...panel.querySelectorAll('button')].find(
      (button) => button.textContent === 'Export current library first',
    )!;
    expect(exportFirst.hidden).toBe(false);

    const form = panel.querySelector<HTMLFormElement>('.library-form')!;
    const confirm = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(confirm.textContent).toBe('Import formulae');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    // First press only arms the confirmation, which counts what it removes…
    expect(library.getLibraryEntries().map((entry) => entry.name)).toEqual(['Existing']);
    expect(confirm.textContent).toBe('Replace 1 formula – press again');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    // …the second executes the replace.
    expect(library.getLibraryEntries().map((entry) => entry.name)).toEqual(['New']);
  });

  it('imports a formula without a trigger a custom shortcut or formula already uses, and says so', async () => {
    const { library, view } = await freshModules();
    const shortcuts = await import('./shortcuts');
    const status = document.createElement('div');
    status.id = 'sr-status';
    document.body.appendChild(status);
    shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon' });
    const mine = library.addLibraryEntry({ name: 'Mine', body: 'm', trigger: 'mine' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);

    const json = JSON.stringify({
      version: 1,
      entries: [
        { ...mine }, // a copy under keep-both
        { id: 'e', name: 'Epsilon', body: 'e', trigger: 'eps', uses: 0 },
        { id: 'f', name: 'Free', body: 'f', trigger: 'free', uses: 0 },
      ],
    });
    const fileInput = panel.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, 'files', {
      value: [new File([json], 'library.json', { type: 'application/json' })],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      if (!panel.querySelector('input[type="radio"]')) throw new Error('options not open');
    });
    const keepBoth = [...panel.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (radio) => radio.value === 'keep-both',
    )!;
    keepBoth.click();
    const form = panel.querySelector<HTMLFormElement>('.library-form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const triggers = library.getLibraryEntries().map((entry) => [entry.name, entry.trigger]);
    expect(triggers).toEqual([
      ['Mine', 'mine'],
      ['Mine (imported)', undefined],
      ['Epsilon', undefined],
      ['Free', 'free'],
    ]);
    await vi.waitFor(() =>
      expect(status.textContent).toBe(
        'Imported 3 formulae. 2 came in without their triggers, which were already in use.',
      ),
    );
  });

  it('calls a saved item a formula everywhere: no entry, expression or item', async () => {
    const { library, view } = await freshModules();
    library.addLibraryEntry({ name: 'Pythagoras', body: 'a^2+b^2=c^2' });
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);
    const forbidden = /\b(entr(y|ies)|expressions?|items?)\b/i;
    const surfaces = (): string[] => [
      panel.textContent ?? '',
      ...[...panel.querySelectorAll('[aria-label], [title]')].flatMap((el) => [
        el.getAttribute('aria-label') ?? '',
        el.getAttribute('title') ?? '',
      ]),
    ];
    const expectApproved = (): void => {
      for (const text of surfaces()) expect(text).not.toMatch(forbidden);
    };
    expectApproved(); // the list and its tools
    panel.querySelector<HTMLButtonElement>('.library-row__edit')!.click();
    expectApproved(); // the Edit form with its Delete button
    [...panel.querySelectorAll('button')].find((b) => b.textContent!.startsWith('Delete'))!.click();
    expectApproved(); // the armed Delete
    const filter = panel.querySelector<HTMLInputElement>('#library-filter')!;
    filter.value = 'zzz';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    expectApproved(); // the no-match state
  });

  // The empty-state hint names the save shortcut with the modifier printed on
  // the user's keyboard: Option on a Mac, Alt elsewhere. The platform is
  // stubbed before the modules load, since the label is read once at import.
  it('names the save shortcut Option+S on a Mac in the empty-state hint', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    const { view } = await freshModules();
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);
    const hint = panel.querySelector('.palette__empty')!.textContent;
    expect(hint).toContain('Option+S');
    expect(hint).not.toContain('Alt+S');
  });

  it('names the save shortcut Alt+S elsewhere in the empty-state hint', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const { view } = await freshModules();
    const { editor } = stubEditor();
    const panel = view.buildLibraryPanel(editor).element;
    document.body.appendChild(panel);
    const hint = panel.querySelector('.palette__empty')!.textContent;
    expect(hint).toContain('Alt+S');
    expect(hint).not.toContain('Option+S');
  });
});

describe('library capture', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  /** A stand-in for the workspace's Save to library mode. */
  function stubHost() {
    const region = document.createElement('div');
    const titles: string[] = [];
    return {
      region,
      titles,
      host: {
        show: (title: string): HTMLElement => {
          titles.push(title);
          return region;
        },
        hide: (): void => region.replaceChildren(),
      },
    };
  }

  it('captures the whole equation and saves it under the typed name', async () => {
    const { library, capture } = await freshModules();
    const { editor } = stubEditor();
    const { host, region, titles } = stubHost();
    const { button } = capture.createLibraryCapture(editor, host);
    document.body.append(button, region);

    button.click();
    expect(titles).toEqual(['Save to library']);
    const form = region.querySelector<HTMLFormElement>('.library-form')!;
    expect(form.querySelector('.library-form__title')).toBeNull(); // the mode shows the title
    const name = form.querySelector<HTMLInputElement>('input')!;
    expect(name.value).toBe('$x+1$'); // pre-filled as the equation's maths
    // The quick path is Name then Enter: the rest waits behind More options.
    const more = form.querySelector<HTMLDetailsElement>('details.library-form__more')!;
    expect(more.open).toBe(false);
    expect(more.contains(form.querySelector('textarea'))).toBe(true);
    const body = form.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(body.value).toBe('x+1');
    name.value = 'My expression';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(library.getLibraryEntries()).toHaveLength(1);
    expect(library.getLibraryEntries()[0]).toMatchObject({
      name: 'My expression',
      body: 'x+1',
    });
    expect(region.querySelector('.library-form')).toBeNull(); // closed
  });

  it('normalises #? in the body to \\placeholder{} on save', async () => {
    const { library, capture } = await freshModules();
    const { editor } = stubEditor();
    const { host, region } = stubHost();
    const { button } = capture.createLibraryCapture(editor, host);
    document.body.append(button, region);
    button.click();
    const form = region.querySelector<HTMLFormElement>('.library-form')!;
    const body = form.querySelector<HTMLTextAreaElement>('textarea')!;
    body.value = '\\frac{#?}{#?}';
    body.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(library.getLibraryEntries()[0]!.body).toBe(
      '\\frac{\\placeholder{}}{\\placeholder{}}',
    );
  });

  it('refuses a trigger that names a real command, and says which', async () => {
    const { capture, library } = await freshModules();
    const { editor } = stubEditor();
    const { host, region } = stubHost();
    const { button } = capture.createLibraryCapture(editor, host);
    document.body.append(button, region);
    button.click();
    const form = region.querySelector<HTMLFormElement>('.library-form')!;
    const trigger = form.querySelectorAll<HTMLInputElement>('input')[1]!;
    trigger.value = 'sum';
    trigger.dispatchEvent(new Event('input', { bubbles: true }));
    const error = [...form.querySelectorAll('.field__error')].find(
      (node) => node.textContent !== '',
    );
    expect(error?.textContent).toContain('\\sum is already a LaTeX command');
    // The problem sits behind More options, so the disclosure opens itself.
    expect(form.querySelector<HTMLDetailsElement>('details.library-form__more')!.open).toBe(true);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(library.getLibraryEntries()).toHaveLength(0);
  });

  it('describes a problem to its field and, on Enter, announces it and focuses the field', async () => {
    const { capture, library } = await freshModules();
    const alert = document.createElement('div');
    alert.id = 'sr-alert';
    document.body.appendChild(alert);
    const { editor } = stubEditor();
    const { host, region } = stubHost();
    const { button } = capture.createLibraryCapture(editor, host);
    document.body.append(button, region);
    button.click();
    const form = region.querySelector<HTMLFormElement>('.library-form')!;
    const [name, trigger] = form.querySelectorAll<HTMLInputElement>('input');
    const body = form.querySelector<HTMLTextAreaElement>('textarea')!;

    // Every hint or error is the description of its field.
    for (const control of [name!, trigger!, body]) {
      const describedBy = control.getAttribute('aria-describedby')!;
      expect(document.getElementById(describedBy)).not.toBeNull();
    }
    expect(trigger!.getAttribute('aria-invalid')).toBe('false');
    trigger!.value = 'sum';
    trigger!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(trigger!.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(trigger!.getAttribute('aria-describedby')!)!.textContent).toBe(
      '\\sum is already a LaTeX command.',
    );

    // Enter from the Name field: nothing is saved, the problem is spoken
    // and focus lands on the Trigger field.
    name!.focus();
    const save = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    expect(save.disabled).toBe(false);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(library.getLibraryEntries()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
    await vi.waitFor(() =>
      expect(alert.textContent).toBe('\\sum is already a LaTeX command.'),
    );
  });

  it('announces instead of opening when the equation is empty', async () => {
    const { capture, library } = await freshModules();
    const { editor } = stubEditor();
    (editor as { isEmpty: () => boolean }).isEmpty = () => true;
    const { host, region, titles } = stubHost();
    const { button } = capture.createLibraryCapture(editor, host);
    document.body.append(button, region);
    button.click();
    expect(titles).toEqual([]);
    expect(region.children).toHaveLength(0);
    expect(library.getLibraryEntries()).toHaveLength(0);
  });
});
