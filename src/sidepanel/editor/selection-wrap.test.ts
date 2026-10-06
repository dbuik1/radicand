import { describe, expect, it } from 'vitest';
import { wrapIntoFirstSlot } from './selection-wrap';

describe('wrapIntoFirstSlot', () => {
  it('fills only the first empty slot', () => {
    expect(wrapIntoFirstSlot('\\frac{\\placeholder{}}{\\placeholder{}}', 'x')).toBe(
      '\\frac{x}{\\placeholder{}}',
    );
  });

  it('fills an identified slot', () => {
    expect(wrapIntoFirstSlot('\\left|\\placeholder[a]{}\\right|', 'x')).toBe('\\left|x\\right|');
  });

  it('is null when the template has no empty slot', () => {
    expect(wrapIntoFirstSlot('\\mathbb{R}', 'x')).toBeNull();
  });

  it('keeps dollar signs in the selection literal', () => {
    expect(wrapIntoFirstSlot('\\placeholder{}', "$& $'")).toBe("$& $'");
  });
});
