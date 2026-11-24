import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { getCompatibilityManifestPath, writeCompatibilityManifest } from "./generate-compatibility-manifest.mjs";
import { createCompatibilityManifest, validateDeploymentUrl } from "./lib/release-metadata.mjs";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live staging compatibility validation`);
  return value;
}

const compatibilityManifestPath = getCompatibilityManifestPath();
await rm(compatibilityManifestPath, { force: true });
createCompatibilityManifest(process.env);
validateDeploymentUrl(process.env.STAGING_FRONTEND_URL, "STAGING_FRONTEND_URL");
requiredEnvironment("STAGING_CASE_ID");
requiredEnvironment("STAGING_ACCESS_TOKEN");

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const compatibility = spawnSync(npmExecutable, ["run", "test:compatibility"], {
  env: process.env,
  stdio: "inherit",
});

if (compatibility.error) throw compatibility.error;
if (compatibility.status !== 0) process.exit(compatibility.status ?? 1);

await writeCompatibilityManifest();
console.log("Live compatibility passed and release artifact is ready");
