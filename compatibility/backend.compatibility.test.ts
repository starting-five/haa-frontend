import { beforeAll, describe, expect, it } from "vitest";

import { apiErrorSchema, healthResponseSchema } from "@/contracts/intake";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for live staging compatibility validation`);
  }
  return value;
}

const backendUrl = requiredEnvironment("STAGING_BACKEND_URL").replace(/\/+$/, "");
const frontendUrl = requiredEnvironment("STAGING_FRONTEND_URL").replace(/\/+$/, "");
const caseId = requiredEnvironment("STAGING_CASE_ID");
const accessToken = requiredEnvironment("STAGING_ACCESS_TOKEN");

process.env.API_URL = backendUrl;

describe("deployed frontend/backend compatibility", () => {
  let getCase: typeof import("@/services/intake").getCase;
  let getSubmissions: typeof import("@/services/intake").getSubmissions;

  beforeAll(async () => {
    ({ getCase, getSubmissions } = await import("@/services/intake"));
  });

  it("validates the live backend health contract", async () => {
    const response = await fetch(`${backendUrl}/health`);
    expect(response.ok).toBe(true);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
  });

  it("validates the deployed frontend health contract", async () => {
    const response = await fetch(`${frontendUrl}/health`);
    expect(response.ok).toBe(true);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
  });

  it.each(["/intake", "/portal/check-email"])(
    "verifies %s rejects an invalid POST without creating staging data",
    async (endpoint) => {
      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect([400, 422]).toContain(response.status);
      expect(apiErrorSchema.safeParse(await response.json()).success).toBe(true);
    }
  );

  it("validates a real case response with the frontend schema", async () => {
    const result = await getCase(caseId);
    expect(result.submissionId).toBe(caseId);
  });

  it("validates authenticated portal submissions with the frontend schema", async () => {
    const result = await getSubmissions(accessToken);
    expect(Array.isArray(result)).toBe(true);
  });

  it("enforces authentication on portal submissions", async () => {
    const response = await fetch(`${backendUrl}/portal/submissions`);
    expect([401, 403]).toContain(response.status);
  });

  it("returns not found for a missing case", async () => {
    const response = await fetch(`${backendUrl}/case/codex-contract-probe-not-found`);
    expect(response.status).toBe(404);
  });

  // A successful registration creates persistent auth state. Its success and
  // error shapes remain covered by deterministic contract/service tests.
});
