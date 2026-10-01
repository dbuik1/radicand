// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateLatex } from 'mathlive';

async function freshForm() {
  vi.resetModules();
  vi.stubGlobal('chrome', undefined);
  return import('./library-form');
}

/**
 * The Save/Edit form's inline errors speak to the person typing: they name
 * the user's fix, never a parser code.
 */
describe('library form body errors', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('turns every parser problem into a sentence with no machine token', async () => {
    const { latexProblemText } = await freshForm();
    const machineToken = /\b[a-z]+-[a-z]+(-[a-z]+)*\b/;
    for (const body of ['\\foo', '{a', '\\begin{matrix}a', '$a', '\\left(a']) {
      const problems = validateLatex(body);
      expect(problems.length, body).toBeGreaterThan(0);
      const text = latexProblemText(problems);
      expect(text, body).not.toMatch(machineToken);
      expect(text, body).toMatch(/^[A-Z\\$]/);
    }
    expect(latexProblemText(validateLatex('\\foo'))).toContain('\\foo');
    expect(latexProblemText(validateLatex('\\begin{matrix}a'))).toContain('matrix');
  });

  it('shows the fix under the LaTeX field, in the field label\'s words', async () => {
    const { createLibraryForm } = await freshForm();
    const form = createLibraryForm({
      initial: { name: 'x', body: '\\foo' },
      submitLabel: 'Save',
      onSubmit: () => {},
      onClose: () => {},
    });
    document.body.appendChild(form);
    const body = form.querySelector<HTMLTextAreaElement>('textarea')!;
    const error = (): string =>
      document.getElementById(body.getAttribute('aria-describedby')!)!.textContent ?? '';
    expect(body.getAttribute('aria-invalid')).toBe('true');
    expect(error()).toBe('\\foo is not a LaTeX command.');
    body.value = '';
    body.dispatchEvent(new Event('input'));
    expect(error()).toBe('Enter the LaTeX for this formula.');
    body.value = 'x^2';
    body.dispatchEvent(new Event('input'));
    expect(error()).toBe('');
    expect(body.getAttribute('aria-invalid')).toBe('false');
  });
});

describe('library form layout', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps the quick form\'s LaTeX preview behind More options, beside the LaTeX box', async () => {
    const { createLibraryForm } = await freshForm();
    const form = createLibraryForm({
      initial: { name: 'x', body: 'x^2' },
      submitLabel: 'Save',
      moreOptions: true,
      onSubmit: () => {},
      onClose: () => {},
    });
    document.body.appendChild(form);
    const preview = form.querySelector('.library-form__preview')!;
    expect(preview.closest('details.library-form__more')).not.toBeNull();
    expect(preview.previousElementSibling?.querySelector('textarea')).not.toBeNull();
  });

  it('renders maths in the name under the Name field, and only then', async () => {
    const { createLibraryForm } = await freshForm();
    const form = createLibraryForm({
      initial: { name: 'Plain', body: 'x^2' },
      submitLabel: 'Save',
      onSubmit: () => {},
      onClose: () => {},
    });
    document.body.appendChild(form);
    const name = form.querySelector<HTMLInputElement>('input')!;
    const namePreview = form.querySelector<HTMLElement>('.library-form__name-preview')!;
    expect(namePreview.hidden).toBe(true);
    name.value = 'Area $\\pi r^2$';
    name.dispatchEvent(new Event('input'));
    expect(namePreview.hidden).toBe(false);
    expect(namePreview.querySelector('.name-maths')).not.toBeNull();
  });
});

describe('library form category', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const field = (form: HTMLElement): HTMLInputElement =>
    [...form.querySelectorAll<HTMLElement>('.library-form__field')]
      .find((wrap) => wrap.querySelector('label')!.textContent === 'Category (optional)')!
      .querySelector('input')!;

  it('trims the category and saves an empty one as none', async () => {
    const { createLibraryForm } = await freshForm();
    const onSubmit = vi.fn();
    const form = createLibraryForm({
      initial: { name: 'x', body: 'x^2' },
      submitLabel: 'Save',
      onSubmit,
      onClose: () => {},
    });
    document.body.appendChild(form);
    const category = field(form);
    category.value = '  Algebra ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ category: 'Algebra' });

    category.value = '   ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit.mock.calls[1]![0]).not.toHaveProperty('category');
  });

  it("suggests the categories already in use and starts from the entry's own", async () => {
    vi.resetModules();
    vi.stubGlobal('chrome', undefined);
    const library = await import('./library');
    const { createLibraryForm } = await import('./library-form');
    library.addLibraryEntry({ name: 'a', body: 'x', category: 'Statistics' });
    library.addLibraryEntry({ name: 'b', body: 'y', category: 'Algebra' });
    const form = createLibraryForm({
      initial: { name: 'x', body: 'x^2', category: 'Algebra' },
      submitLabel: 'Save',
      onSubmit: () => {},
      onClose: () => {},
    });
    document.body.appendChild(form);
    const category = field(form);
    expect(category.value).toBe('Algebra');
    const list = document.getElementById(category.getAttribute('list')!)!;
    expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual(['Algebra', 'Statistics']);
  });
});
