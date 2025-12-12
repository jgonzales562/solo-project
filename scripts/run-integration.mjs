import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMP_DIR = path.join(ROOT, '.tmp-test');

const cleanup = () => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
};

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
  });
  if (result.error) {
    console.error(`Failed to run ${cmd}:`, result.error.message);
    return 1;
  }
  if (result.status === null) {
    console.error(`Process for ${cmd} terminated by signal`);
    return 1;
  }
  return result.status;
};

let status = 0;

try {
  cleanup();
  status = run('tsc', ['-p', 'tsconfig.test.json', '--outDir', TEMP_DIR, '--noEmit', 'false']);
  if (status === 0) {
    status = run('node', ['--test', path.join(TEMP_DIR, 'test', 'composeRoutes.test.js')]);
  }
} finally {
  cleanup();
}

process.exit(status);
