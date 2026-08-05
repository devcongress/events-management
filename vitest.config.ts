import path from 'path';
import vue from '@vitejs/plugin-vue';

export default {
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
};
