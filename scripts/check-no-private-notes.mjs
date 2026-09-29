/**
 * Guard: the maintainer's working notes (plans, research, reviews, design
 * briefs, spikes) are kept outside this repository. None of their
 * directories may be committed here, and no tracked file may link to one,
 * since such a link is dead for everybody else. Session links and session
 * trailers are refused for the same reason.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const self = 'scripts/check-no-private-notes.mjs';

const NOTES = ['docs/plans/', 'docs/research/', 'docs/reviews/', 'docs/design/', 'spikes/', 'public-export/'];
const FORBID = [...NOTES, 'claude.ai/code/', 'Claude-Session:'];
const TEXT = /\.(md|mjs|js|ts|json|html|css|txt|yml|yaml|svg)$|(^|\/)\.git(ignore|attributes)$|(^|\/)LICENSE$/;

const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];
for (const file of files) {
  if (NOTES.some((dir) => file.startsWith(dir))) problems.push(`${file} – a working-notes path`);
  if (file === self || !TEXT.test(file)) continue;
  readFileSync(join(root, file), 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const needle of FORBID) {
        if (line.includes(needle)) problems.push(`${file}:${index + 1} – mentions ${needle}`);
      }
    });
}

if (problems.length > 0) {
  console.error(`✗ working-notes check failed: ${problems.length} problem(s).`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nWorking notes live outside this repository; remove the file or the reference.');
  process.exit(1);
}
console.log(`✓ working-notes check passed: ${files.length} tracked files, none private.`);
