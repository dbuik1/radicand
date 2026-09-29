import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Code comments state constraints that hold today. A plan-stage label, a
 * pointer to a design document or a "this replaced X" aside carries nothing
 * once the plan is archived or the earlier code is gone, so none of them
 * may appear in a comment. The scan covers every source, test and script
 * file; generated data and build output are skipped.
 */
const ROOT = join(__dirname, '..');
const SCANNED_DIRS = ['src', 'tests', 'scripts'];
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'data']);
const SCANNED_EXTENSIONS = /\.(ts|mjs|css)$/;

const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(L[1-5]|R[1-4][abc]?|S[0-3]|C[0-3])\b/,
    reason: 'plan-stage label – state the constraint the stage delivered',
  },
  {
    pattern: /\b(as|per) the plan\b|\bas (discussed|agreed|requested|instructed)\b|\bper (CLAUDE|AGENTS)\.md\b|\bper the spec\b/i,
    reason: 'provenance – state the constraint, not where it came from',
  },
  {
    pattern: /\bhandoff\b|\bartboards?\b|\bredesign\b|\bused to be\b/i,
    reason: 'point-in-time reference – state what holds now',
  },
  {
    pattern: /\bstyle toolbar\b|\bLibrary tab\b|\bCompact view\b/i,
    reason: 'retired control name – Style menu, My library mode, Ctrl+Shift+Y',
  },
];

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

/** The comment text of each line, or null for a line that holds none. */
function commentLines(source: string): Array<string | null> {
  let inBlock = false;
  return source.split('\n').map((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return trimmed;
    }
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/');
      return trimmed;
    }
    if (trimmed.startsWith('//')) return trimmed;
    return null;
  });
}

describe('code comments', () => {
  it('state constraints, never plan stages, design documents or retired names', () => {
    const offences: string[] = [];
    for (const dir of SCANNED_DIRS) {
      for (const file of listFiles(join(ROOT, dir))) {
        const lines = commentLines(readFileSync(file, 'utf8'));
        lines.forEach((text, index) => {
          if (text === null) return;
          for (const { pattern, reason } of FORBIDDEN) {
            if (pattern.test(text)) {
              offences.push(`${relative(ROOT, file)}:${index + 1} [${reason}] ${text}`);
            }
          }
        });
      }
    }
    expect(offences).toEqual([]);
  });
});
