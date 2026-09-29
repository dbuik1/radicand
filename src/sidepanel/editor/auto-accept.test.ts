import { describe, expect, it } from 'vitest';
import autoAccept from '../../assets/auto-accept-index.json';
import candidates from '../../assets/auto-accept-candidates.json';
import commandIndex from '../../assets/command-index.json';
import { STYLE_COMMANDS } from './styling';

const known = new Set<string>([
  ...commandIndex.commands,
  ...autoAccept.extraCommands,
  ...Object.keys(STYLE_COMMANDS),
  ...candidates.candidates,
]);

describe('auto-accept map', () => {
  it('never lets a command complete when a longer known command starts with it', () => {
    for (const name of autoAccept.names) {
      const longer = [...known].filter((other) => other !== name && other.startsWith(name));
      expect(longer, `\\${name} would hijack these`).toEqual([]);
    }
  });

  it('holds every candidate exactly once, as either accepted or ambiguous', () => {
    const held = [...autoAccept.names, ...Object.keys(autoAccept.ambiguous)].sort();
    expect(held).toEqual([...new Set(candidates.candidates)].sort());
  });

  it('records the longer names behind every ambiguous command', () => {
    for (const [name, longer] of Object.entries(autoAccept.ambiguous)) {
      expect(longer.length).toBeGreaterThan(0);
      for (const other of longer) expect(other.startsWith(name) && other !== name).toBe(true);
    }
  });

  it('keeps the commands from the report ambiguous', () => {
    for (const name of ['le', 'ge', 'to', 'lim', 'sin', 'cos', 'tan', 'cot', 'int', 'pi', 'in', 'ne']) {
      expect(autoAccept.names).not.toContain(name);
      expect(Object.keys(autoAccept.ambiguous)).toContain(name);
    }
  });

  it('still auto-accepts the unambiguous structure and Greek commands', () => {
    for (const name of ['sqrt', 'frac', 'vec', 'hat', 'alpha', 'theta', 'times', 'neq', 'notin']) {
      expect(autoAccept.names).toContain(name);
    }
  });

  it('lists every style command as a candidate', () => {
    const listed = new Set(candidates.candidates);
    for (const name of Object.keys(STYLE_COMMANDS)) expect(listed.has(name), name).toBe(true);
  });
});
