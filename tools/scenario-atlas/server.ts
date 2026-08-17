import { join } from 'node:path';

import { loadCatalog } from './catalog/catalog';
import { storedStatusSchema } from './catalog/schema';
import { AtlasDatabase } from './engine/database';
import { applyScenarioState } from './engine/status';
import { assertLocalAtlasRuntime, isAllowedMutation, isLoopbackHostname } from './safety';

assertLocalAtlasRuntime(Bun.env);

const hostname = '127.0.0.1';
const port = Number(Bun.env.SCENARIO_ATLAS_PORT ?? 4178);
const toolRoot = import.meta.dir;
const repoRoot = join(toolRoot, '../..');
const appRoot = join(toolRoot, 'app');
const database = new AtlasDatabase(join(repoRoot, '.scenario-atlas/atlas.sqlite'));
const catalog = loadCatalog();
const scenarioIds = new Set(catalog.workflows.flatMap((workflow) => workflow.checkpoints.flatMap((checkpoint) => checkpoint.scenarios.map((scenario) => scenario.id))));

const mimeTypes: Record<string, string> = {
  '/': 'text/html; charset=utf-8',
  '/index.html': 'text/html; charset=utf-8',
  '/app.js': 'text/javascript; charset=utf-8',
  '/styles.css': 'text/css; charset=utf-8',
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

async function updateScenario(request: Request, scenarioId: string): Promise<Response> {
  if (!isAllowedMutation(request)) return json({ error: 'Cross-origin Atlas mutations are forbidden.' }, 403);
  if (!scenarioIds.has(scenarioId)) return json({ error: 'Unknown scenario.' }, 404);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 8192) return json({ error: 'Request body is too large.' }, 413);

  try {
    const body = await request.json() as { status?: unknown; note?: unknown };
    const status = storedStatusSchema.parse(body.status);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
    database.write(scenarioId, status, note);
    return json(applyScenarioState(catalog, database.readAll()));
  } catch {
    return json({ error: 'Status must be untested, verified, or failed.' }, 400);
  }
}

const server = Bun.serve({
  hostname,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (!isLoopbackHostname(url.hostname)) return new Response('Scenario Atlas is available only on loopback.', { status: 403 });

    if (request.method === 'GET' && url.pathname === '/api/health') return json({ localOnly: true, catalogVersion: catalog.version });
    if (request.method === 'GET' && url.pathname === '/api/catalog') return json(applyScenarioState(catalog, database.readAll()));
    const scenarioStatusMatch = url.pathname.match(/^\/api\/scenarios\/([^/]+)\/status$/);
    if (request.method === 'PUT' && scenarioStatusMatch) {
      return updateScenario(request, decodeURIComponent(scenarioStatusMatch[1]));
    }
    if (request.method === 'POST' && url.pathname === '/api/reset') {
      if (!isAllowedMutation(request)) return json({ error: 'Cross-origin Atlas mutations are forbidden.' }, 403);
      database.reset();
      return json(applyScenarioState(catalog, {}));
    }

    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    const staticPath = url.pathname === '/' ? '/index.html' : url.pathname;
    if (staticPath.startsWith('/fonts/')) {
      const fontName = staticPath.slice('/fonts/'.length);
      if (!/^inter-(400|600|700)\.woff2$/.test(fontName)) return new Response('Not found', { status: 404 });
      return new Response(Bun.file(join(repoRoot, 'public/fonts', fontName)), { headers: { 'content-type': 'font/woff2' } });
    }
    if (!(staticPath in mimeTypes)) return new Response('Not found', { status: 404 });
    return new Response(Bun.file(join(appRoot, staticPath.slice(1))), {
      headers: {
        'content-type': mimeTypes[staticPath],
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
      },
    });
  },
});

function shutdown() {
  database.close();
  server.stop(true);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
console.log(`Scenario Atlas (local only) listening on http://${hostname}:${port}`);
