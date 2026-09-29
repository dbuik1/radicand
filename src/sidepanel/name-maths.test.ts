// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { hasNameMaths, renderName, splitName, spokenName } from './name-maths';

describe('maths in formula names', () => {
  it('splits text from the maths between $ signs', () => {
    expect(splitName('Area of a circle $\\pi r^2$')).toEqual([
      { text: 'Area of a circle ' },
      { latex: '\\pi r^2' },
    ]);
    expect(splitName('$a$ and $b$')).toEqual([{ latex: 'a' }, { text: ' and ' }, { latex: 'b' }]);
  });

  it('keeps an escaped, unpaired or empty $ as text', () => {
    expect(splitName('Costs \\$5')).toEqual([{ text: 'Costs $5' }]);
    expect(splitName('Price $5')).toEqual([{ text: 'Price $5' }]);
    expect(splitName('Empty $$ pair')).toEqual([{ text: 'Empty $$ pair' }]);
    expect(splitName('$\\$x$')).toEqual([{ latex: '\\$x' }]);
    expect(hasNameMaths('Price $5')).toBe(false);
  });

  it('speaks the maths as words and leaves plain names alone', () => {
    expect(spokenName('Quadratic formula')).toBe('Quadratic formula');
    const spoken = spokenName('Area $\\pi r^2$');
    expect(spoken.startsWith('Area ')).toBe(true);
    expect(spoken).not.toContain('$');
    expect(spoken).not.toContain('\\');
    expect(spoken.toLowerCase()).toContain('pi');
  });

  it('renders the maths hidden from assistive technology, with the words in its place', () => {
    const target = document.createElement('span');
    renderName(target, 'Area $\\pi r^2$');
    expect(target.querySelector('[aria-hidden="true"] .name-maths')).not.toBeNull();
    expect(target.querySelector('.visually-hidden')?.textContent).toBe(spokenName('Area $\\pi r^2$'));
    renderName(target, 'Plain');
    expect(target.innerHTML).toBe('Plain');
  });
});
