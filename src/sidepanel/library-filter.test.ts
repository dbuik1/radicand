import { describe, it, expect } from 'vitest';
import { categoriesOf, categoryKey } from './library-filter';

describe('library category filter', () => {
  it('has no category for a missing or blank value', () => {
    expect(categoryKey({})).toBeNull();
    expect(categoryKey({ category: '   ' })).toBeNull();
  });

  it('folds case and surrounding space into one identity', () => {
    expect(categoryKey({ category: ' Algebra ' })).toBe('algebra');
    expect(categoryKey({ category: 'ALGEBRA' })).toBe('algebra');
  });

  it('lists each distinct category once, alphabetically, under its first spelling', () => {
    expect(
      categoriesOf([
        { category: 'Statistics' },
        {},
        { category: 'algebra' },
        { category: ' Algebra' },
        { category: 'Calculus' },
      ]),
    ).toEqual([
      { key: 'algebra', label: 'algebra' },
      { key: 'calculus', label: 'Calculus' },
      { key: 'statistics', label: 'Statistics' },
    ]);
  });

  it('lists nothing when no entry has a category', () => {
    expect(categoriesOf([{}, { category: '' }])).toEqual([]);
  });
});
