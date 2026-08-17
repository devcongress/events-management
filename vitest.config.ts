import path from 'path';
import vue from '@vitejs/plugin-vue';

export default {
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tools/scenario-atlas/engine/database.bun.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
};
