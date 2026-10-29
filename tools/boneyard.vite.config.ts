import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  appType: "mpa",
  server: { hmr: false },
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
    },
  },
});
