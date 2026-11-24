import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],

  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    globals: true,
    setupFiles: ["./vitest.setup.ts"],

    // Node 26 turns on its own Web Storage. Without --localstorage-file its
    // localStorage is undefined, and both globals sit in front of jsdom's, so
    // the page tests lost localStorage and a Storage.prototype spy missed
    // sessionStorage. The tests are written against the browser's storage.
    execArgv: ["--no-experimental-webstorage"],

    // Playwright E2E tests are executed separately.
    exclude: ["compatibility/**", "e2e/**", "node_modules/**"],
  },

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
