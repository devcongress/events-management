import vue from '@vitejs/plugin-vue';
import devServer from '@hono/vite-dev-server';
import { defineConfig, loadEnv } from 'vite';
import { renderAppBootMarkup, APP_BOOT_STYLES } from './lib/app-boot';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      {
        name: 'devcongress-app-boot',
        configureServer(server) {
          server.middlewares.use('/app-boot.css', (_request, response) => {
            response.setHeader('Content-Type', 'text/css; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(APP_BOOT_STYLES);
          });
        },
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'app-boot.css',
            source: APP_BOOT_STYLES,
          });
        },
        transformIndexHtml(html, context) {
          const pathname = context.originalUrl
            ? new URL(context.originalUrl, 'http://vite.local').pathname
            : '/';
          return html
            .replace('</head>', '    <link rel="stylesheet" href="/app-boot.css">\n  </head>')
            .replace('<div id="app"></div>', `<div id="app">${renderAppBootMarkup(pathname)}</div>`);
        },
      },
      vue(),
      devServer({
        entry: 'server/app.ts',
        env,
      }),
    ],
    resolve: {
      alias: {
        '@': new URL('.', import.meta.url).pathname,
      },
    },
    server: {
      port: 3000,
    },
  };
});
