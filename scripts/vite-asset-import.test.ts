import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let origin: string;
let cacheDir: string;

beforeAll(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'ems-vite-assets-'));

  server = await createServer({
    cacheDir,
    configFile: 'vite.config.ts',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null },
  });
  await server.listen();

  const address = server.httpServer?.address();

  if (!address || typeof address === 'string') throw new Error('Missing local test server address');

  origin = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  await server?.close();
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

it.each([
  '/src/bones/admin-events-list.bones.json?import',
  '/src/bones/admin-registration-workspace-emails.bones.json?import',
  '/brand/dev-con-logo.png?import',
])('serves %s asset imports as modules instead of the app HTML fallback', async (path) => {
  const response = await fetch(`${origin}${path}`);
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('javascript');
  expect(body).toContain('export default');
  expect(body).not.toContain('<!doctype html>');
}, 15_000);
