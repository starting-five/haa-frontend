import { describe, expect, it } from "vitest";

import { getBuildInfo, KNOWN_ENVIRONMENTS, type BuildEnvironment } from "../build-info";

// The version endpoint is public, so what it reports has to be decided here
// rather than by whatever happens to be in the environment: a value that does
// not match its shape is reported as unknown, never echoed.

const complete: BuildEnvironment = {
  version: "0.1.0-rc8",
  gitSha: "e5fa6b79c84f9c6482d5dfe185b4f405762c77c9",
  buildId: "gha-17482912-1",
  builtAt: "2026-09-22T09:15:00Z",
  environment: "alpha",
  imageDigest: `sha256:${"a".repeat(64)}`,
};

describe("frontend build info", () => {
  it("reports the build metadata and the deployment environment together", () => {
    expect(getBuildInfo(complete)).toEqual({
      application: "haa-frontend",
      version: "0.1.0-rc8",
      gitSha: "e5fa6b79c84f9c6482d5dfe185b4f405762c77c9",
      environment: "alpha",
      buildId: "gha-17482912-1",
      builtAt: "2026-09-22T09:15:00.000Z",
      imageDigest: `sha256:${"a".repeat(64)}`,
    });
  });

  it("names every environment the platform deploys to", () => {
    for (const environment of KNOWN_ENVIRONMENTS) {
      expect(getBuildInfo({ ...complete, environment }).environment).toBe(environment);
    }
    // the same immutable build reports whichever environment it is started in
    expect(getBuildInfo({ ...complete, environment: "BETA" }).environment).toBe("beta");
  });

  it("falls back to unknown rather than reporting an unbuilt or mislabelled artefact", () => {
    expect(getBuildInfo({})).toEqual({
      application: "haa-frontend",
      version: "unknown",
      gitSha: "unknown",
      environment: "unknown",
    });
  });

  it.each([
    ["version", { version: "v1.0.0" }],
    ["version", { version: "1.0.0-rc" }],
    // the old build-numbered format, and an internal build tag: neither is a public version
    ["version", { version: "1.0.0-rc.95" }],
    ["version", { version: "0.1.0-rc8.95" }],
    ["version", { version: "0.1.0-beta1" }],
    ["version", { version: "0.1.0-beta.1" }],
    ["version", { version: "1.0" }],
    ["gitSha", { gitSha: "e5fa6b7" }],
    ["gitSha", { gitSha: `${"z".repeat(40)}` }],
  ])("reports an invalid %s as unknown", (field, override) => {
    const info = getBuildInfo({ ...complete, ...(override as BuildEnvironment) });
    expect(info[field as "version" | "gitSha"]).toBe("unknown");
  });

  it("reports the public beta version as it was built", () => {
    expect(getBuildInfo({ ...complete, version: "0.1.0-beta" }).version).toBe("0.1.0-beta");
  });

  it("omits optional fields that are absent or malformed instead of guessing", () => {
    const info = getBuildInfo({
      ...complete,
      buildId: "not a valid build id!",
      builtAt: "the other day",
      imageDigest: "sha256:short",
    });
    expect(info).not.toHaveProperty("buildId");
    expect(info).not.toHaveProperty("builtAt");
    expect(info).not.toHaveProperty("imageDigest");
    expect(info.version).toBe("0.1.0-rc8");
  });

  it("normalises a mixed-case sha and digest", () => {
    const info = getBuildInfo({
      ...complete,
      gitSha: "E5FA6B79C84F9C6482D5DFE185B4F405762C77C9",
      imageDigest: `SHA256:${"A".repeat(64)}`,
    });
    expect(info.gitSha).toBe("e5fa6b79c84f9c6482d5dfe185b4f405762c77c9");
    expect(info.imageDigest).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("carries nothing but build identity — no configuration, no secrets", () => {
    const serialized = JSON.stringify(
      getBuildInfo({
        ...complete,
        // Values of the kind that live beside the build metadata in the same
        // env file, assembled rather than written out so a fixture cannot trip
        // a secret scanner.
        ...({
          supabaseServiceRoleKey: ["sb", "secret", "value"].join("_"),
          databaseUrl: `postgres${"ql"}://user:${"pw"}@host/db`,
        } as object),
      })
    );
    expect(serialized).not.toMatch(/sb_secret|postgresql:|service_role|password|@host/i);
    expect(Object.keys(getBuildInfo(complete)).sort()).toEqual([
      "application",
      "buildId",
      "builtAt",
      "environment",
      "gitSha",
      "imageDigest",
      "version",
    ]);
  });
});
