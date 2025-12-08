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
  return result.status ?? 1;
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
