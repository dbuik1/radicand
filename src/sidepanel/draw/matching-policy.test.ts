import { describe, it, expect } from 'vitest';
import { CANDIDATE_GROUPS, groupPartners, groupAdjacently } from './matching-policy';

const byLatex = (item: { latex: string }): string => item.latex;
const ranked = (...latexes: string[]): { latex: string }[] =>
  latexes.map((latex) => ({ latex }));

describe('candidate grouping policy', () => {
  it('lists every group member as a partner of every other', () => {
    for (const group of CANDIDATE_GROUPS) {
      expect(group.length).toBeGreaterThanOrEqual(2);
      for (const member of group) {
        const partners = groupPartners(member);
        expect(partners).toHaveLength(group.length - 1);
        for (const other of group) {
          if (other !== member) expect(partners).toContain(other);
        }
      }
    }
  });

  it('keeps a class in exactly one group', () => {
    const seen = new Set<string>();
    for (const group of CANDIDATE_GROUPS) {
      for (const member of group) {
        expect(seen.has(member), `${member} appears in two groups`).toBe(false);
        seen.add(member);
      }
    }
  });

  it('pulls a grouped twin up to the row after its partner', () => {
    const reordered = groupAdjacently(
      ranked('\\cap', '\\alpha', '\\beta', '\\bigcap', '\\gamma'),
      byLatex,
    );
    expect(reordered.map(byLatex)).toEqual(['\\cap', '\\bigcap', '\\alpha', '\\beta', '\\gamma']);
  });

  it('never moves the best match', () => {
    const reordered = groupAdjacently(ranked('\\alpha', '\\bigcap', '\\beta', '\\cap'), byLatex);
    expect(reordered[0]!.latex).toBe('\\alpha');
    // The pair still ends up adjacent, anchored at the better-ranked member.
    expect(reordered.map(byLatex)).toEqual(['\\alpha', '\\bigcap', '\\cap', '\\beta']);
  });

  it('keeps three-way groups contiguous', () => {
    const reordered = groupAdjacently(
      ranked('\\wedge', '\\alpha', '\\Lambda', '\\beta', '\\bigwedge'),
      byLatex,
    );
    expect(reordered.map(byLatex)).toEqual([
      '\\wedge',
      '\\Lambda',
      '\\bigwedge',
      '\\alpha',
      '\\beta',
    ]);
  });

  it('leaves ungrouped rankings untouched', () => {
    const input = ranked('\\alpha', '\\beta', '\\gamma');
    expect(groupAdjacently(input, byLatex)).toEqual(input);
  });
});
