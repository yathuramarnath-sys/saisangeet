import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",   // Required for Electron — loads assets relative to index.html
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.js"
  }
});
