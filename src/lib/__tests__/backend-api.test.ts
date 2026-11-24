import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiBaseUrl, normalizeApiUrl } from "../backend-api";

describe("backend API resolution", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("normalizes trailing slashes", () => {
    expect(normalizeApiUrl("https://api.example.com///")).toBe("https://api.example.com");
  });

  it("uses the same-origin proxy in browser builds when enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_API_PROXY", "true");
    expect(getApiBaseUrl()).toBe("/api/backend");
  });

  it("preserves the configured direct API behavior by default", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_API_PROXY", "false");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com/");
    expect(getApiBaseUrl()).toBe("https://api.example.com");
  });
});
