import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const botDir = join(root, 'bot');
const entry = join(botDir, 'dist', 'index.js');

if (!existsSync(entry)) {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: botDir,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
