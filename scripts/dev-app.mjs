#!/usr/bin/env node
/**
 * Starts the token API and Vite together (LiveKit Server stays separate).
 * No extra npm dependencies.
 *
 * On Unix, children run in their own process groups so npm + vite/tsx trees
 * can be terminated together. On Windows, taskkill /T is used.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const FORCE_KILL_MS = 5_000;

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

let shuttingDown = false;

function start(command, args, cwd, label) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: isWin,
    // New process group on Unix so we can signal the whole npm→node tree.
    detached: !isWin,
  });

  child.on('error', (error) => {
    console.error(`[dev:app] failed to start ${label}:`, error.message);
    void shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev:app] ${label} exited (code=${code}, signal=${signal})`);
    void shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

function signalChild(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (isWin) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    // Negative PID = process group (requires detached: true).
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

function waitForChildExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolveWait) => {
    child.once('exit', () => resolveWait());
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    signalChild(child, 'SIGTERM');
  }

  const forceTimer = setTimeout(() => {
    for (const child of children) {
      signalChild(child, 'SIGKILL');
    }
  }, FORCE_KILL_MS);
  forceTimer.unref?.();

  await Promise.all(children.map((child) => waitForChildExit(child)));
  clearTimeout(forceTimer);

  process.exit(code);
}

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});

console.log('[dev:app] starting token server + Vite');
console.log('[dev:app] Keep LiveKit in another terminal: livekit-server --dev');

start('npm', ['run', 'dev'], resolve(root, 'server'), 'server');
start('npm', ['run', 'dev'], root, 'vite');
