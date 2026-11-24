import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["compatibility/post-deployment.compatibility.test.ts"],
    testTimeout: 20_000,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
});
