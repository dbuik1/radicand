/**
 * The `\` finder's ranking: what a partly-typed command offers, and in what
 * order. The order is the part users feel, so it is pinned here rather than
 * only through the e2e spec.
 */
import { describe, it, expect } from 'vitest';
import { matchCommands, MAX_SUGGESTIONS } from './command-match';
import type { CommandCandidate } from './command-match';

const candidate = (
  name: string,
  glyph = '',
  latex = `\\${name}`,
  terms: string[] = [],
): CommandCandidate => ({
  name,
  latex,
  label: name,
  glyph,
  terms,
});

const CANDIDATES: CommandCandidate[] = [
  candidate('pi', 'π', '\\pi', ['pi', 'circle', 'constant']),
  candidate('piecewise'),
  candidate('pm', '±', '\\pm', ['plus', 'minus']),
  candidate('prod', '∏', '\\prod', ['product']),
  candidate('Pi', 'Π', '\\Pi', ['capital', 'pi']),
  candidate('sqrt', '√', '\\sqrt{#?}', ['square', 'root', 'radical']),
  candidate('sqcup', '⊔', '\\sqcup', ['square', 'cup', 'union']),
  candidate('forall', '∀', '\\forall', ['for', 'all', 'universal', 'quantifier']),
];

describe('matchCommands', () => {
  it('offers nothing until a letter is typed', () => {
    expect(matchCommands('', CANDIDATES)).toEqual([]);
  });

  it('offers every command starting with the typed letters, names first', () => {
    expect(matchCommands('p', CANDIDATES).map((match) => match.name).slice(0, 4)).toEqual([
      'pi',
      'pm',
      'prod',
      'piecewise',
    ]);
  });

  it('finds a symbol by its description when the name is not known', () => {
    expect(matchCommands('all', CANDIDATES).map((match) => match.name)).toEqual(['forall']);
  });

  it('ranks a description match below every command-name match', () => {
    const names = matchCommands('sq', CANDIDATES).map((match) => match.name);
    // \sqrt and \sqcup match by name; \sqrt also matches "square", and
    // nothing else does.
    expect(names).toEqual(['sqrt', 'sqcup']);
  });

  it('lists a command matched by both name and description only once', () => {
    expect(matchCommands('pi', CANDIDATES).filter((match) => match.name === 'pi')).toHaveLength(1);
  });

  it('ranks a symbol\'s own name above a word later in its description', () => {
    const names = matchCommands('squ', CANDIDATES).map((match) => match.name);
    expect(names).toEqual(['sqrt', 'sqcup']);
  });

  it('puts an exact name first, ahead of longer commands starting with it', () => {
    expect(matchCommands('pi', CANDIDATES)[0]?.name).toBe('pi');
  });

  it('is case-sensitive: Pi and pi are different symbols', () => {
    // One letter never reaches the descriptions – it starts a word in
    // almost every one of them.
    expect(matchCommands('P', CANDIDATES).map((match) => match.name)).toEqual(['Pi']);
  });

  it('ranks a command the symbol index describes above a bare name', () => {
    const names = matchCommands('pi', CANDIDATES).map((match) => match.name);
    expect(names.indexOf('pi')).toBeLessThan(names.indexOf('piecewise'));
  });

  it('carries the template that puts the caret in the slot', () => {
    expect(matchCommands('sqrt', CANDIDATES)[0]?.latex).toBe('\\sqrt{#?}');
  });

  it('offers no more than the list can show', () => {
    const many = Array.from({ length: 40 }, (_, index) => candidate(`al${index}`, 'α'));
    expect(matchCommands('al', many)).toHaveLength(MAX_SUGGESTIONS);
    expect(matchCommands('al', many, 3)).toHaveLength(3);
  });

  it('puts the user\'s own triggers first, and an exact trigger ahead of a same-named command', () => {
    const own = (name: string, latex: string, label = name): CommandCandidate => ({
      ...candidate(name, '', latex),
      label,
      triggerId: `id-${name}`,
    });
    const withOwn = [...CANDIDATES, own('pd', '\\partial', 'Partial'), own('pi', 'p_i', 'Index p')];
    // A prefix match: the shortcut outranks described commands.
    expect(matchCommands('p', withOwn)[0]?.name).toBe('pd');
    // Both exact: the trigger the user made wins, the command follows.
    const exact = matchCommands('pi', withOwn);
    expect(exact[0]).toMatchObject({ name: 'pi', triggerId: 'id-pi' });
    expect(exact[1]).toMatchObject({ name: 'pi', latex: '\\pi' });
  });

  it('finds a trigger by a word of its name or keywords', () => {
    const own: CommandCandidate = {
      ...candidate('RR', '', '\\mathbb{R}', ['real', 'numbers', 'reals']),
      label: 'Real numbers',
      triggerId: 'id-RR',
    };
    expect(matchCommands('rea', [...CANDIDATES, own])[0]?.name).toBe('RR');
  });

  it('offers nothing for a command no version of MathLive knows', () => {
    expect(matchCommands('qzx', CANDIDATES)).toEqual([]);
  });
});
