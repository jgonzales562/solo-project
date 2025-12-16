import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 250;

function parsePort(value, fallback) {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const num = Number(trimmed.replace(/_/g, '').replace(/,/g, ''));
  if (!Number.isFinite(num)) return fallback;
  if (num <= 0 || num > 65535) return fallback;
  return Math.trunc(num);
}

const port = parsePort(process.env.PORT, DEFAULT_PORT);
const readyUrl = new URL(`http://localhost:${port}/ready`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestOnce(target) {
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'https:' ? https : http;
    const req = client.request(
      target,
      { method: 'GET', headers: { Connection: 'close' } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function waitForReady() {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  console.log(`Waiting for ${readyUrl.toString()}...`);
  for (;;) {
    try {
      const status = await requestOnce(readyUrl);
      if (status >= 200 && status < 300) return;
    } catch {
      // ignore until timeout
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${DEFAULT_TIMEOUT_MS}ms waiting for ${readyUrl.toString()}`
      );
    }

    await sleep(DEFAULT_INTERVAL_MS);
  }
}

function startBrowserSync() {
  const browserSyncBin = path.join(
    ROOT,
    'node_modules',
    'browser-sync',
    'dist',
    'bin.js'
  );

  const args = [
    browserSyncBin,
    'start',
    '--proxy',
    `localhost:${port}`,
    '--files',
    'client/**/*',
    '--no-open',
    '--no-notify',
  ];

  return spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}

try {
  await waitForReady();
  const child = startBrowserSync();
  child.on('exit', (code) => process.exit(code ?? 1));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
