import { expect, test } from "@playwright/test";

import { caseDataSchema, healthResponseSchema, submissionsSchema } from "../src/contracts/intake";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for deployed staging E2E validation`);
  }
  return value;
}

const backendUrl = requiredEnvironment("STAGING_BACKEND_URL").replace(/\/+$/, "");
const caseId = requiredEnvironment("STAGING_CASE_ID");
const accessToken = requiredEnvironment("STAGING_ACCESS_TOKEN");

test.describe("deployed staging release safety", () => {
  test("frontend health and critical locale route respond", async ({ page, request }) => {
    const health = await request.get("/health");
    expect(health.ok()).toBe(true);
    expect(healthResponseSchema.parse(await health.json())).toEqual({ status: "ok" });

    const response = await page.goto("/en/get-help");
    expect(response?.ok()).toBe(true);
    await expect(page.getByText("Preferred language")).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  });

  test("browser origin can reach backend health", async ({ page }) => {
    await page.goto("/en/get-help");
    const health = await page.evaluate(async (url) => {
      const response = await fetch(`${url}/health`);
      return { ok: response.ok, body: await response.json() };
    }, backendUrl);

    expect(health.ok).toBe(true);
    expect(healthResponseSchema.parse(health.body)).toEqual({ status: "ok" });
  });

  test("critical case flow renders a live compatible backend response", async ({ page, request }) => {
    const apiResponse = await request.get(`${backendUrl}/case/${encodeURIComponent(caseId)}`);
    expect(apiResponse.ok()).toBe(true);
    const caseData = caseDataSchema.parse(await apiResponse.json());
    expect(caseData.submissionId).toBe(caseId);

    const pageResponse = await page.goto(`/en/case/${encodeURIComponent(caseId)}`);
    expect(pageResponse?.ok()).toBe(true);
    await expect(page.getByText(caseId.slice(-8).toUpperCase())).toBeVisible();
  });

  test("authenticated portal response matches the frontend contract", async ({ request }) => {
    const response = await request.get(`${backendUrl}/portal/submissions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.ok()).toBe(true);
    expect(Array.isArray(submissionsSchema.parse(await response.json()))).toBe(true);
  });
});
