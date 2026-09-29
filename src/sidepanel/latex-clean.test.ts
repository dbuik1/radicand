import { describe, it, expect } from 'vitest';
import { convertLatexToMarkup } from 'mathlive';
import { stripRedundantFences } from './latex-clean';

describe('stripRedundantFences', () => {
  it('strips fences around short content', () => {
    expect(stripRedundantFences('\\left(x\\right)')).toBe('(x)');
    expect(stripRedundantFences('\\sin\\left(x\\right)')).toBe('\\sin(x)');
    expect(stripRedundantFences('\\left[a+b\\right]')).toBe('[a+b]');
    expect(stripRedundantFences('\\left\\{y\\right\\}')).toBe('\\{y\\}');
    expect(stripRedundantFences('\\left|z\\right|')).toBe('|z|');
    expect(stripRedundantFences('\\left\\lVert v\\right\\rVert')).toBe('\\lVert v\\rVert');
    expect(stripRedundantFences('\\left\\langle u,v\\right\\rangle')).toBe('\\langle u,v\\rangle');
  });

  it('superscripts alone do not count as tall (the TeXnique convention)', () => {
    expect(stripRedundantFences('\\left(a^2+2ab+2b^2\\right)')).toBe('(a^2+2ab+2b^2)');
    expect(stripRedundantFences('\\left(x^n\\right)')).toBe('(x^n)');
  });

  it('keeps fences around genuinely tall content', () => {
    expect(stripRedundantFences('\\left(\\frac{a}{b}\\right)')).toBe(
      '\\left(\\frac{a}{b}\\right)',
    );
    // The `(?![a-zA-Z])` guard, not \b: digits and _ are word characters.
    expect(stripRedundantFences('\\left(\\frac12\\right)')).toBe('\\left(\\frac12\\right)');
    expect(stripRedundantFences('\\left(\\sum_i x_i\\right)')).toBe(
      '\\left(\\sum_i x_i\\right)',
    );
    expect(stripRedundantFences('\\left[\\begin{matrix}a\\\\b\\end{matrix}\\right]')).toBe(
      '\\left[\\begin{matrix}a\\\\b\\end{matrix}\\right]',
    );
    expect(stripRedundantFences('\\left(\\sqrt{x}\\right)')).toBe(
      '\\left(\\sqrt{x}\\right)',
    );
  });

  it('never mistakes \\leftarrow for a fence token', () => {
    expect(stripRedundantFences('a\\leftarrow b')).toBe('a\\leftarrow b');
    expect(stripRedundantFences('\\left(a\\leftarrow b\\right)')).toBe('(a\\leftarrow b)');
  });

  it('keeps pairs containing a top-level \\middle', () => {
    const input = '\\left\\{x\\middle|x>0\\right\\}';
    expect(stripRedundantFences(input)).toBe(input);
  });

  it('maps null delimiters to nothing', () => {
    expect(stripRedundantFences('\\left.x\\right|')).toBe('x|');
  });

  it('keeps delimiters with no plain form', () => {
    const input = '\\left\\uparrow x\\right\\downarrow';
    expect(stripRedundantFences(input)).toBe(input);
  });

  it('works innermost-first: an outer pair frees up once its inner pair goes', () => {
    expect(stripRedundantFences('\\left(\\left(x\\right)+y\\right)')).toBe('((x)+y)');
    // The inner pair survives (tall), so the outer must too.
    expect(stripRedundantFences('\\left(\\left(\\frac{a}{b}\\right)+y\\right)')).toBe(
      '\\left(\\left(\\frac{a}{b}\\right)+y\\right)',
    );
  });

  it('returns unbalanced input untouched', () => {
    expect(stripRedundantFences('\\left(x')).toBe('\\left(x');
    expect(stripRedundantFences('x\\right)')).toBe('x\\right)');
    expect(stripRedundantFences('\\middle|')).toBe('\\middle|');
  });

  it('leaves fence-free input alone', () => {
    expect(stripRedundantFences('')).toBe('');
    expect(stripRedundantFences('\\frac{a}{b}+c')).toBe('\\frac{a}{b}+c');
  });
});

describe('the tall-content heuristic against MathLive’s own font metrics', () => {
  // MathLive tags enlarged delimiters with ML__delim-size* classes; base-size
  // ones get no such class. Every pair the heuristic KEEPS should genuinely
  // enlarge – checked against the renderer rather than a hand-kept oracle.
  const kept = [
    '\\left(\\frac{a}{b}\\right)',
    '\\left[\\begin{matrix}a\\\\b\\end{matrix}\\right]',
    '\\left(\\sum_{i}^{n} x_i\\right)',
  ];
  it.each(kept)('%s renders with an enlarged delimiter', (latex) => {
    expect(stripRedundantFences(latex)).toBe(latex);
    expect(convertLatexToMarkup(latex)).toMatch(/ML__delim-size/);
  });
});
