import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { getCompatibilityManifestPath } from "./generate-compatibility-manifest.mjs";
import { createReleaseRecord, serializeMetadata, validateCompatibilityManifest } from "./lib/release-metadata.mjs";

const outputPath = path.resolve(process.env.RELEASE_RECORD_PATH ?? "artifacts/release-record.json");
const manifest = validateCompatibilityManifest(JSON.parse(await readFile(getCompatibilityManifestPath(), "utf8")));
const record = createReleaseRecord(process.env);
if (
  manifest.frontendSha !== record.frontendSha ||
  manifest.backendSha !== record.backendSha ||
  manifest.backendImageDigest !== record.backendImageDigest ||
  manifest.stagingUrl !== record.stagingBackendUrl
) {
  throw new Error("Release record metadata does not match the passed compatibility manifest");
}
const temporaryPath = `${outputPath}.tmp`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(temporaryPath, serializeMetadata(record), { encoding: "utf8", mode: 0o600 });
await rename(temporaryPath, outputPath);
console.log(`Release record written: ${outputPath}`);
