import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Two properties of the source text itself, beyond what the compiler sees.
 * A control character in a source file makes grep and most editors treat it
 * as binary, so a search for a name stops reporting that file's lines. A
 * keyboard-shortcut label written outside shortcut-labels.ts is a label the
 * platform-aware spelling cannot reach, so a Mac reads "Ctrl" in one place
 * and "Cmd" in the next.
 */
const ROOT = join(__dirname, '..');
const SCANNED_DIRS = ['src', 'tests', 'scripts'];
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'data', 'assets']);
const SCANNED_EXTENSIONS = /\.(ts|mjs|css|html|json)$/;

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) listFiles(full, out);
    } else if (SCANNED_EXTENSIONS.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('source files', () => {
  it('hold no control characters, so every search tool reads them as text', () => {
    const offences: string[] = [];
    for (const dir of SCANNED_DIRS) {
      for (const file of listFiles(join(ROOT, dir))) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            const hit = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.exec(line);
            if (hit) {
              const code = hit[0].charCodeAt(0).toString(16).padStart(2, '0');
              offences.push(`${relative(ROOT, file)}:${index + 1} U+00${code.toUpperCase()}`);
            }
          });
      }
    }
    expect(offences).toEqual([]);
  });
});

describe('keyboard-shortcut labels', () => {
  /** The files allowed to spell a modifier: the label module and the manifest's Chrome defaults. */
  const LABEL_FILES = new Set(['src/sidepanel/shortcut-labels.ts', 'src/manifest.config.ts']);

  /** The file with comments removed, so only code and strings remain. */
  const withoutComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('are written in shortcut-labels.ts only, so every surface spells the modifiers alike', () => {
    const offences: string[] = [];
    for (const file of listFiles(join(ROOT, 'src'))) {
      const path = relative(ROOT, file).split(sep).join('/');
      if (!path.endsWith('.ts') || path.endsWith('.test.ts') || LABEL_FILES.has(path)) continue;
      withoutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          if (/\b(Ctrl|Cmd|Control|Meta|Option|Alt)\+[A-Za-z/]/.test(line)) {
            offences.push(`${path}:${index + 1} ${line.trim()}`);
          }
        });
    }
    expect(offences).toEqual([]);
  });
});
