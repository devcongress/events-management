import vue from '@vitejs/plugin-vue';
import devServer from '@hono/vite-dev-server';
import { defineConfig, loadEnv } from 'vite';
import { APP_BOOT_MARKUP, APP_BOOT_STYLES } from './lib/app-boot';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      {
        name: 'devcongress-app-boot',
        transformIndexHtml(html) {
          return html
            .replace('</head>', `    <style>${APP_BOOT_STYLES}</style>\n  </head>`)
            .replace('<div id="app"></div>', `<div id="app">${APP_BOOT_MARKUP}</div>`);
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
