import { defineConfig, devices } from "@playwright/test";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for deployed staging E2E validation`);
  }
  return value;
}

function requiredDeploymentUrl(name: string): string {
  const url = new URL(requiredEnvironment(name));
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) {
    throw new Error(`${name} must identify a deployed HTTPS environment`);
  }
  return url.origin;
}

const baseURL = requiredDeploymentUrl("STAGING_FRONTEND_URL");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "staging.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
