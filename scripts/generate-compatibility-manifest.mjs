import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCompatibilityManifest, serializeMetadata } from "./lib/release-metadata.mjs";

/** @param {Record<string, string | undefined>} environment */
export function getCompatibilityManifestPath(environment = process.env) {
  return path.resolve(environment.COMPATIBILITY_MANIFEST_PATH ?? "artifacts/frontend-backend-compatibility.json");
}

/**
 * @param {Record<string, string | undefined>} environment
 * @param {string} outputPath
 */
export async function writeCompatibilityManifest(
  environment = process.env,
  outputPath = getCompatibilityManifestPath(environment)
) {
  const manifest = createCompatibilityManifest(environment);
  const temporaryPath = `${outputPath}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, serializeMetadata(manifest), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
  return manifest;
}
