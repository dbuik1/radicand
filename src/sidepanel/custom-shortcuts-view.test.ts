// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EditorController } from './editor';

/**
 * Custom shortcuts against the real (in-memory) stores and a stub editor:
 * a keyboard-only user can add, find, insert, edit, delete and undo, take
 * the common set on and off, and import a file – and no route lets a
 * shortcut shadow a LaTeX command or a My library trigger.
 */
function stubEditor() {
  const insert = vi.fn();
  const focus = vi.fn();
  const editor = { insert, focus } as unknown as EditorController;
  return { editor, insert, focus };
}

async function freshModules() {
  vi.resetModules();
  vi.stubGlobal('chrome', undefined);
  const shortcuts = await import('./shortcuts');
  const library = await import('./library');
  const view = await import('./custom-shortcuts-view');
  const common = await import('./shortcuts-common');
  return { shortcuts, library, view, common };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount() {
  const modules = await freshModules();
  const { editor, insert } = stubEditor();
  const onEscape = vi.fn();
  const panel = modules.view.buildCustomShortcutsPanel(editor, { onEscape });
  document.body.append(panel.status, panel.element);
  const root = panel.element;
  const buttonNamed = (text: string): HTMLButtonElement =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (btn) => btn.textContent === text && !btn.closest('[hidden]'),
    )!;
  const fieldLabelled = (text: string): HTMLInputElement | HTMLTextAreaElement => {
    const label = [...root.querySelectorAll('label')].find((l) => l.textContent === text)!;
    return document.getElementById(label.htmlFor) as HTMLInputElement;
  };
  const type = (control: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const submit = (): void => {
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  };
  const rows = (): string[] =>
    [...root.querySelectorAll('.library-row .shortcut-row__trigger')].map((t) => t.textContent!);
  return { ...modules, panel, root, insert, onEscape, buttonNamed, fieldLabelled, type, submit, rows };
}

describe('custom shortcuts view', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('opens empty on the three ways in and the whole common set, grouped', async () => {
    const { panel, root, buttonNamed, common } = await mount();
    expect(panel.status.textContent).toBe('No shortcuts yet');
    expect(root.querySelector<HTMLElement>('#shortcuts-filter')!.closest('[hidden]')).not.toBeNull();
    expect(buttonNamed('Add shortcut')).toBeDefined();
    expect(buttonNamed(`Add ${common.COMMON_SHORTCUTS.length} common shortcuts`)).toBeDefined();
    expect(buttonNamed('Import…')).toBeDefined();
    const groups = [...root.querySelectorAll('.shortcuts-common__name')].map((g) => g.textContent);
    expect(groups).toEqual([
      'Number sets',
      'Greek letters',
      'Powers and roots',
      'Fractions and calculus',
      'Logic and sets',
      'Brackets and layout',
    ]);
    expect(root.querySelectorAll('.shortcuts-common__item')).toHaveLength(
      common.COMMON_SHORTCUTS.length,
    );
    // Each item is rendered and names itself for a screen reader.
    const alpha = [...root.querySelectorAll('.shortcuts-common__item')].find(
      (item) => item.querySelector('.shortcuts-common__trigger')!.textContent === 'al',
    )!;
    expect(alpha.querySelector('.shortcuts-common__glyph')!.innerHTML).not.toBe('');
    expect(alpha.querySelector('.visually-hidden')!.textContent).toBe(', Alpha');
    panel.focus();
    expect(document.activeElement).toBe(buttonNamed('Add shortcut'));
  });

  it('adds the common set, leaving out a My library trigger, and takes it back', async () => {
    const { panel, root, buttonNamed, library, common, shortcuts, rows } = await mount();
    library.addLibraryEntry({ name: 'Differential', body: '\\mathrm{d}x', trigger: 'dx' });
    buttonNamed(`Add ${common.COMMON_SHORTCUTS.length} common shortcuts`).click();
    const count = common.COMMON_SHORTCUTS.length - 1;
    expect(shortcuts.getShortcuts()).toHaveLength(count);
    expect(rows()).not.toContain('dx');
    expect(panel.status.textContent).toBe(`${count} shortcuts`);
    // Rows run in trigger order, ignoring case.
    expect(rows().slice(0, 3)).toEqual(['AA', 'abs', 'al']);
    expect(root.querySelector('.shortcuts-panel__empty')!.closest('[hidden]')).not.toBeNull();

    buttonNamed('Remove common shortcuts').click();
    expect(shortcuts.getShortcuts()).toHaveLength(0);
    expect(panel.status.textContent).toBe('No shortcuts yet');
    expect(document.activeElement).toBe(buttonNamed('Add shortcut'));
  });

  it('adds a shortcut from the form, stripping a typed backslash', async () => {
    const { panel, root, buttonNamed, fieldLabelled, type, submit, shortcuts, rows } = await mount();
    buttonNamed('Add shortcut').click();
    await flush();
    expect(panel.status.textContent).toBe('Adding a shortcut');
    expect(root.querySelector('h3')!.textContent).toBe('Add shortcut');
    // A fresh form opens clean, with focus on Trigger.
    expect(document.activeElement).toBe(fieldLabelled('Trigger'));
    expect([...root.querySelectorAll('.field__error')].map((e) => e.textContent).join('')).toBe('');

    type(fieldLabelled('Trigger'), '\\vareps');
    type(fieldLabelled('LaTeX'), '\\varepsilon');
    type(fieldLabelled('Name'), 'Epsilon');
    submit();
    expect(shortcuts.getShortcuts()).toMatchObject([
      { trigger: 'vareps', latex: '\\varepsilon', name: 'Epsilon' },
    ]);
    expect(rows()).toEqual(['vareps']);
    expect(panel.status.textContent).toBe('1 shortcut');
    expect(document.activeElement).toBe(root.querySelector('.library-row__insert'));
    expect(root.querySelector('.library-row__insert')!.getAttribute('aria-label')).toBe(
      'vareps, inserts \\varepsilon, Epsilon',
    );
  });

  it('refuses a missing trigger, a LaTeX command and a library trigger', async () => {
    const { root, buttonNamed, fieldLabelled, type, submit, shortcuts, library } = await mount();
    library.addLibraryEntry({ name: 'Differential', body: '\\mathrm{d}x', trigger: 'dx' });
    buttonNamed('Add shortcut').click();
    await flush();
    const trigger = fieldLabelled('Trigger');
    const error = (): string => document.getElementById(trigger.getAttribute('aria-describedby')!)!.textContent!;

    submit();
    expect(error()).toBe('Enter a trigger of two or more letters.');
    expect(document.activeElement).toBe(trigger);
    expect(fieldLabelled('LaTeX').getAttribute('aria-invalid')).toBe('true');

    type(trigger, 'int');
    expect(error()).toBe('\\int is already a LaTeX command. Choose a different trigger.');
    type(trigger, 'dx');
    expect(error()).toBe('A library formula already uses \\dx. Choose a different trigger.');
    type(fieldLabelled('LaTeX'), '\\mathrm{d}x');
    submit();
    expect(shortcuts.getShortcuts()).toHaveLength(0);
    expect(root.querySelector('form')).not.toBeNull();
  });

  it('inserts on activation and filters by trigger, name and LaTeX', async () => {
    const { root, shortcuts, insert, type, rows } = await mount();
    shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon', name: 'Epsilon' });
    shortcuts.addShortcut({ trigger: 'RR', latex: '\\mathbb{R}', name: 'Real numbers' });
    root.querySelector<HTMLButtonElement>('.library-row__insert')!.click();
    expect(insert).toHaveBeenCalledWith('\\varepsilon', { focus: false });
    expect(shortcuts.getShortcuts().find((s) => s.trigger === 'eps')!.uses).toBe(1);

    const filter = root.querySelector<HTMLInputElement>('#shortcuts-filter')!;
    type(filter, 'real');
    expect(rows()).toEqual(['RR']);
    type(filter, 'mathbb');
    expect(rows()).toEqual(['RR']);
    type(filter, 'zzz');
    expect(rows()).toEqual([]);
    expect(root.querySelector('.palette__empty')!.textContent).toBe(
      'No shortcuts match – clear the filter to see all 2',
    );
  });

  it('edits, deletes on a second press, and undoes the delete', async () => {
    const { panel, root, buttonNamed, fieldLabelled, type, submit, shortcuts, rows } = await mount();
    shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon', name: 'Epsilon' });
    const edit = root.querySelector<HTMLButtonElement>('.library-row__edit')!;
    edit.click();
    await flush();
    expect(panel.status.textContent).toBe('Editing eps');
    expect(root.querySelector('h3')!.textContent).toBe('Edit shortcut');
    // Its own trigger is no clash.
    expect(fieldLabelled('Trigger').getAttribute('aria-invalid')).toBe('false');
    type(fieldLabelled('Name'), 'Small epsilon');
    submit();
    expect(shortcuts.getShortcuts()[0]).toMatchObject({ trigger: 'eps', name: 'Small epsilon' });
    expect(document.activeElement).toBe(root.querySelector('.library-row__edit'));

    root.querySelector<HTMLButtonElement>('.library-row__edit')!.click();
    await flush();
    const del = buttonNamed('Delete');
    del.click();
    expect(shortcuts.getShortcuts()).toHaveLength(1);
    expect(del.textContent).toBe('Delete – press again');
    del.click();
    expect(shortcuts.getShortcuts()).toHaveLength(0);
    const undo = buttonNamed('Undo delete of eps');
    expect(document.activeElement).toBe(undo);
    undo.click();
    expect(rows()).toEqual(['eps']);
    expect(document.activeElement).toBe(root.querySelector('.library-row__insert'));
  });

  it('Escape leaves the form for the list, focusing what opened it', async () => {
    const { panel, root, buttonNamed, shortcuts } = await mount();
    shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon' });
    const add = buttonNamed('Add shortcut');
    add.click();
    await flush();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    root.querySelector('form input')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(root.querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(add);
    expect(panel.status.textContent).toBe('1 shortcut');
  });

  describe('import', () => {
    const fileWith = (entries: object[]): File =>
      new File([JSON.stringify({ version: 1, entries })], 'shortcuts.json', {
        type: 'application/json',
      });

    async function chooseFile(root: HTMLElement, file: File): Promise<void> {
      const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await flush();
      await flush();
    }

    const incoming = [
      { trigger: 'eps', latex: '\\epsilon' },
      { trigger: 'dx', latex: '\\mathrm{d}x' },
      { trigger: 'int', latex: '\\int' },
      { trigger: 'RR', latex: '\\mathbb{R}' },
    ];

    it('names duplicates and the triggers it will skip, then merges', async () => {
      const { root, panel, shortcuts, library, buttonNamed, submit } = await mount();
      library.addLibraryEntry({ name: 'Differential', body: '\\mathrm{d}x', trigger: 'dx' });
      shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon' });
      await chooseFile(root, fileWith(incoming));
      expect(panel.status.textContent).toBe('Importing shortcuts.json');
      expect(root.querySelector('.shortcuts-import__summary')!.textContent).toBe(
        'shortcuts.json holds 4 shortcuts. 1 uses a trigger you already have.',
      );
      expect(root.querySelector('form .field__hint')!.textContent).toBe(
        'dx is also a trigger in My library, so it will be skipped. Change it there to import it. ' +
          '\\int is a LaTeX command, so it will be skipped.',
      );
      expect(document.activeElement).toBe(root.querySelector('input[value="skip"]'));
      expect(buttonNamed('Export current shortcuts first')).toBeUndefined();
      submit();
      expect(shortcuts.getShortcuts().map((s) => s.trigger).sort()).toEqual(['RR', 'eps']);
      expect(shortcuts.getShortcuts().find((s) => s.trigger === 'eps')!.latex).toBe('\\varepsilon');
      expect(root.querySelector('form')).toBeNull();
    });

    it('keeps both copies under a new trigger', async () => {
      const { root, shortcuts, submit } = await mount();
      shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon' });
      await chooseFile(root, fileWith(incoming));
      const keep = root.querySelector<HTMLInputElement>('input[value="keep-both"]')!;
      keep.checked = true;
      keep.dispatchEvent(new Event('change', { bubbles: true }));
      submit();
      expect(shortcuts.getShortcuts().map((s) => s.trigger).sort()).toEqual([
        'RR',
        'dx',
        'eps',
        'epsb',
      ]);
    });

    it('replaces only on a second press, offering an export first', async () => {
      const { root, shortcuts, buttonNamed, submit } = await mount();
      shortcuts.addShortcut({ trigger: 'eps', latex: '\\varepsilon' });
      shortcuts.addShortcut({ trigger: 'ooo', latex: '\\infty' });
      await chooseFile(root, fileWith(incoming));
      const replace = root.querySelector<HTMLInputElement>('input[value="replace"]')!;
      replace.checked = true;
      replace.dispatchEvent(new Event('change', { bubbles: true }));
      expect(buttonNamed('Export current shortcuts first')).toBeDefined();
      submit();
      expect(shortcuts.getShortcuts()).toHaveLength(2);
      expect(buttonNamed('Replace 2 shortcuts – press again')).toBeDefined();
      submit();
      expect(shortcuts.getShortcuts().map((s) => s.trigger).sort()).toEqual(['RR', 'dx', 'eps']);
    });

    const choose = (root: HTMLElement, value: string): void => {
      const radio = root.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    };

    it('never renames a kept copy onto a My library trigger', async () => {
      const { root, shortcuts, library, submit } = await mount();
      library.addLibraryEntry({ name: 'Nine', body: '9', trigger: 'zzb' });
      shortcuts.addShortcut({ trigger: 'zz', latex: '1' });
      await chooseFile(root, fileWith([{ trigger: 'zz', latex: '2' }]));
      choose(root, 'keep-both');
      submit();
      expect(shortcuts.getShortcuts().map((s) => s.trigger).sort()).toEqual(['zz', 'zzc']);
    });

    it('asks what to do with a trigger the file repeats, and renames extra copies', async () => {
      const { root, shortcuts, library, submit } = await mount();
      library.addLibraryEntry({ name: 'Nine', body: '9', trigger: 'zzb' });
      await chooseFile(
        root,
        fileWith(Array.from({ length: 28 }, (_, i) => ({ trigger: 'zz', latex: String(i + 1) }))),
      );
      const field = root.querySelector<HTMLFieldSetElement>(
        'fieldset[aria-describedby="shortcuts-import-repeats-hint"]',
      )!;
      expect(field.querySelector('legend')!.textContent).toBe('Repeated triggers in the file');
      expect(document.getElementById('shortcuts-import-repeats-hint')!.textContent).toBe(
        '\\zz appears more than once in shortcuts.json.',
      );
      expect(root.querySelector<HTMLInputElement>('input[value="rename"]')!.checked).toBe(true);
      submit();
      const triggers = shortcuts.getShortcuts().map((s) => s.trigger);
      expect(triggers).toHaveLength(28);
      expect(new Set(triggers).size).toBe(28);
      expect(triggers).not.toContain('zzb');
      expect(triggers).toContain('zzaa');
    });

    it('can keep only the first copy of a repeated trigger, even when replacing', async () => {
      const { root, shortcuts, submit } = await mount();
      await chooseFile(
        root,
        fileWith([
          { trigger: 'zz', latex: '1' },
          { trigger: 'zz', latex: '2' },
          { trigger: 'yy', latex: '3' },
        ]),
      );
      choose(root, 'replace');
      choose(root, 'first');
      submit();
      expect(shortcuts.getShortcuts().map((s) => [s.trigger, s.latex])).toEqual([
        ['zz', '1'],
        ['yy', '3'],
      ]);
    });

    it('gives each repeated copy its own trigger when replacing', async () => {
      const { root, shortcuts, submit } = await mount();
      await chooseFile(
        root,
        fileWith([
          { trigger: 'zz', latex: '1' },
          { trigger: 'zz', latex: '2' },
        ]),
      );
      choose(root, 'replace');
      submit();
      expect(shortcuts.getShortcuts().map((s) => [s.trigger, s.latex])).toEqual([
        ['zz', '1'],
        ['zzb', '2'],
      ]);
    });

    it('shows no repeated-trigger question when every trigger is distinct', async () => {
      const { root } = await mount();
      await chooseFile(root, fileWith(incoming));
      expect(root.querySelector('input[name="shortcuts-import-repeats"]')).toBeNull();
    });

    it('turns away a file that is not a shortcuts file', async () => {
      const { root } = await mount();
      document.body.insertAdjacentHTML('beforeend', '<div id="a11y-assertive"></div>');
      await chooseFile(root, new File(['not json'], 'notes.txt'));
      expect(root.querySelector('form')).toBeNull();
    });
  });
});
