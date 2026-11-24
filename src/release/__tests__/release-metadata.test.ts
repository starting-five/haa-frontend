import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCompatibilityManifest,
  createReleaseRecord,
  serializeMetadata,
  validateCompatibilityManifest,
  validateReleaseRecord,
} from "../../../scripts/lib/release-metadata.mjs";
import { writeCompatibilityManifest } from "../../../scripts/generate-compatibility-manifest.mjs";

const metadata = {
  FRONTEND_SHA: "a".repeat(40),
  FRONTEND_IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
  BACKEND_SHA: "c".repeat(40),
  BACKEND_IMAGE_DIGEST: `sha256:${"d".repeat(64)}`,
  STAGING_FRONTEND_URL: "https://staging-frontend.example.com/",
  STAGING_BACKEND_URL: "https://staging-backend.example.com/",
};

describe("compatibility release metadata", () => {
  it("creates the exact backend-consumed compatibility manifest", () => {
    const manifest = createCompatibilityManifest(metadata);
    expect(manifest).toEqual({
      frontendSha: "a".repeat(40),
      backendSha: "c".repeat(40),
      backendImageDigest: `sha256:${"d".repeat(64)}`,
      stagingUrl: "https://staging-backend.example.com",
      result: "pass",
    });
    expect(validateCompatibilityManifest(manifest)).toEqual(manifest);
  });

  it("writes the validated compatibility manifest deterministically", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "haa-compatibility-"));
    const outputPath = path.join(directory, "frontend-backend-compatibility.json");
    try {
      const manifest = await writeCompatibilityManifest(metadata, outputPath);
      expect(await readFile(outputPath, "utf8")).toBe(serializeMetadata(manifest));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes a stale pass artifact before a failed compatibility run", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "haa-stale-compatibility-"));
    const outputPath = path.join(directory, "frontend-backend-compatibility.json");
    await writeFile(outputPath, serializeMetadata(createCompatibilityManifest(metadata)));
    try {
      const result = spawnSync(process.execPath, [path.resolve("scripts/run-compatibility.mjs")], {
        env: {
          ...process.env,
          COMPATIBILITY_MANIFEST_PATH: outputPath,
          FRONTEND_SHA: "",
        },
      });
      expect(result.status).not.toBe(0);
      await expect(access(outputPath)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["malformed frontend SHA", { FRONTEND_SHA: "abc" }],
    ["malformed backend SHA", { BACKEND_SHA: "abc" }],
    ["malformed image digest", { BACKEND_IMAGE_DIGEST: "sha256:abc" }],
    ["missing staging URL", { STAGING_BACKEND_URL: "" }],
    ["unsafe staging URL", { STAGING_BACKEND_URL: "http://localhost:4000" }],
  ])("rejects %s", (_label, change) => {
    expect(() => createCompatibilityManifest({ ...metadata, ...change })).toThrow();
  });

  it("rejects non-pass and unexpected manifest fields", () => {
    const manifest = createCompatibilityManifest(metadata);
    expect(() => validateCompatibilityManifest({ ...manifest, result: "fail" })).toThrow();
    expect(() => validateCompatibilityManifest({ ...manifest, accessToken: "secret" })).toThrow();
  });

  it("creates a deterministic non-secret release pair record", () => {
    const record = createReleaseRecord(metadata);
    expect(record).toEqual({
      frontendSha: "a".repeat(40),
      frontendImageDigest: `sha256:${"b".repeat(64)}`,
      backendSha: "c".repeat(40),
      backendImageDigest: `sha256:${"d".repeat(64)}`,
      stagingFrontendUrl: "https://staging-frontend.example.com",
      stagingBackendUrl: "https://staging-backend.example.com",
      compatibilityResult: "pass",
    });
    expect(serializeMetadata(record)).toBe(`${JSON.stringify(record, null, 2)}\n`);
    expect(serializeMetadata(record)).not.toContain("ACCESS_TOKEN");
    expect(validateReleaseRecord(record)).toEqual(record);
    expect(() => validateReleaseRecord({ ...record, compatibilityResult: "fail" })).toThrow();
  });
});
