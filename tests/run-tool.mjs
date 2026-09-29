/**
 * Build steps shared by the test runners, started through Node itself so
 * they work the same on every platform: `npm` and `npx` are batch files on
 * Windows, which Node will not start without a shell.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `vite build --config <config>`, from the repository root. */
export function viteBuild(config) {
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  execFileSync(process.execPath, [vite, 'build', '--config', config], { cwd: ROOT, stdio: 'inherit' });
}

/** `npm run <script>`, through the npm that started this runner when there is one. */
export function npmRun(script) {
  const npm = process.env.npm_execpath;
  if (npm) {
    execFileSync(process.execPath, [npm, 'run', script], { cwd: ROOT, stdio: 'inherit' });
  } else {
    execFileSync('npm', ['run', script], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  }
}
