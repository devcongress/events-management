import app from './app';
import { applyAppBootVariant } from '@/lib/app-boot';

const port = Number(Bun.env.PORT ?? 3000);
const distRoot = new URL('../dist/', import.meta.url);
const indexFile = new URL('index.html', distRoot);

async function htmlResponse(file: Blob, pathname: string): Promise<Response> {
  const html = await file.text();
  return new Response(applyAppBootVariant(html, pathname), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request);
    }

    const staticPath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const staticFile = Bun.file(new URL(staticPath, distRoot));

    if (await staticFile.exists()) {
      if (url.pathname === '/' || !url.pathname.split('/').pop()?.includes('.')) {
        return htmlResponse(staticFile, url.pathname);
      }
      return new Response(staticFile);
    }

    return htmlResponse(Bun.file(indexFile), url.pathname);
  },
});

console.log(`DevCon-Comm listening on http://localhost:${port}`);
