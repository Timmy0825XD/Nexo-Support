'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'nexo-support');
const DEFAULT_REPO = 'https://github.com/Timmy0825XD/Nexo-Support.git';
const DEFAULT_BRANCH = 'chore/npm-start-wispbyte';

function env(name, fallback = '') {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function gitRepoUrl() {
  let url = env('GIT_ADDRESS', DEFAULT_REPO);
  const user = env('USERNAME');
  const token = env('ACCESS_TOKEN');
  if (user && token && url.startsWith('https://')) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(token)}`;
    url = url.replace('https://', `https://${auth}@`);
  }
  return url;
}

function branchName() {
  const branch = env('BRANCH', env('INSTALL_BRANCH', DEFAULT_BRANCH));
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new Error(`Invalid git branch: ${branch}`);
  }
  return branch;
}

function hasApp() {
  return fs.existsSync(path.join(APP_DIR, 'index.js')) && fs.existsSync(path.join(APP_DIR, 'bot'));
}

function canvasNativePackage() {
  const { platform, arch } = process;
  if (platform === 'linux') {
    let libc = 'gnu';
    try {
      const report = process.report?.getReport?.();
      if (!report?.header?.glibcVersionRuntime) {
        libc = 'musl';
      }
    } catch {
      libc = 'gnu';
    }
    return `@napi-rs/canvas-linux-${arch}-${libc}`;
  }
  if (platform === 'win32') {
    return `@napi-rs/canvas-win32-${arch}-msvc`;
  }
  if (platform === 'darwin') {
    return `@napi-rs/canvas-darwin-${arch}`;
  }
  return null;
}

function isInstalled(pkg) {
  return [
    path.join(APP_DIR, 'node_modules', pkg),
    path.join(APP_DIR, 'bot', 'node_modules', pkg),
  ].some((candidate) => fs.existsSync(candidate));
}

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function installDeps() {
  const native = canvasNativePackage();
  if (native && !isInstalled(native)) {
    console.log(`Missing ${native}. Reinstalling dependencies for ${process.platform}/${process.arch}...`);
    rmDir(path.join(APP_DIR, 'node_modules'));
    rmDir(path.join(APP_DIR, 'bot', 'node_modules'));
  }

  run('npm', ['install', '--include=optional', '--foreground-scripts'], APP_DIR);

  if (native && !isInstalled(native)) {
    console.log(`Installing ${native}...`);
    run('npm', ['install', native, '--foreground-scripts'], APP_DIR);
  }
}

function cloneOrUpdate() {
  const repo = gitRepoUrl();
  const branch = branchName();
  const autoUpdate = env('AUTO_UPDATE', '1') === '1';

  if (!fs.existsSync(path.join(APP_DIR, '.git'))) {
    if (fs.existsSync(APP_DIR)) {
      fs.rmSync(APP_DIR, { recursive: true, force: true });
    }
    console.log(`Cloning ${repo} (${branch})...`);
    run('git', ['clone', '--depth', '1', '--branch', branch, repo, APP_DIR], ROOT);
    return;
  }

  if (autoUpdate) {
    console.log(`Updating ${branch}...`);
    run('git', ['fetch', 'origin', branch], APP_DIR);
    run('git', ['reset', '--hard', `origin/${branch}`], APP_DIR);
  }
}

function startBot() {
  installDeps();
  run('npm', ['run', 'build'], APP_DIR);
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: path.join(APP_DIR, 'bot'),
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
}

try {
  cloneOrUpdate();
  if (!hasApp()) {
    throw new Error('Clone finished but index.js/bot are missing. Check GIT_ADDRESS and BRANCH.');
  }
  startBot();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
