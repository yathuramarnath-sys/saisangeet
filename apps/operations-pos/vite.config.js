import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version } = require("./package.json");

export default defineConfig({
  plugins: [react()],
  base: "./",   // Required for Electron — loads assets relative to index.html
  define: {
    __APP_VERSION__: JSON.stringify(version),  // injected at build time from package.json
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.js"
  }
});
