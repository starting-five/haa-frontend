import { beforeAll, describe, expect, it } from "vitest";

import { healthResponseSchema } from "@/contracts/intake";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for post-deployment verification`);
  return value.replace(/\/+$/, "");
}

const frontendUrl = requiredEnvironment("PRODUCTION_FRONTEND_URL");
const backendUrl = requiredEnvironment("PRODUCTION_BACKEND_URL");
const caseId = requiredEnvironment("PRODUCTION_CASE_ID");
process.env.API_URL = backendUrl;

describe("production post-deployment verification", () => {
  let getCase: typeof import("@/services/intake").getCase;

  beforeAll(async () => {
    ({ getCase } = await import("@/services/intake"));
  });

  it("loads the production frontend", async () => {
    const response = await fetch(`${frontendUrl}/en/get-help`);
    expect(response.ok).toBe(true);
    expect(await response.text()).toContain("HelpAfterAccident");
  });

  it("validates the production backend health contract", async () => {
    const response = await fetch(`${backendUrl}/health`);
    expect(response.ok).toBe(true);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
  });

  it("validates one critical read-only case contract", async () => {
    const result = await getCase(caseId);
    expect(result.submissionId).toBe(caseId);
  });
});
