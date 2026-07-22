#!/usr/bin/env node
/**
 * Starts the token API and Vite together (LiveKit Server stays separate).
 * No extra npm dependencies.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const children = [];

function start(command, args, cwd, label) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  child.on('exit', (code, signal) => {
    console.error(`[dev:app] ${label} exited (code=${code}, signal=${signal})`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev:app] starting token server + Vite');
console.log('[dev:app] Keep LiveKit in another terminal: livekit-server --dev');

start('npm', ['run', 'dev'], resolve(root, 'server'), 'server');
start('npm', ['run', 'dev'], root, 'vite');
