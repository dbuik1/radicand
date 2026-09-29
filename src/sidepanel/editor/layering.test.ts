import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The editor directory wraps the field and nothing else: the expression
 * library and the recent-symbols list reach it only through the options the
 * host passes to createEditor. A direct import would drag their storage code
 * into every host that mounts a field.
 */
const FORBIDDEN = ['../library', '../recent', '../library-view', '../library-capture', '../workspace'];

describe('editor layering', () => {
  it('imports neither the library nor the recent list', () => {
    const dir = __dirname;
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      const source = readFileSync(join(dir, name), 'utf8');
      for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
        const specifier = match[1] ?? '';
        if (FORBIDDEN.some((f) => specifier === f || specifier.startsWith(`${f}/`))) {
          offenders.push(`${name} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
