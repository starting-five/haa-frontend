import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveAppVersion } from "./lib/app-version.mjs";

// Prints the public version — package.json's version, e.g. 0.1.0-rc8 — for the
// build pipeline to pass to docker as a build argument. It is what /api/version
// reports. Nothing here reaches the container: the container is given the
// answer, not the means to work it out.

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));

process.stdout.write(`${resolveAppVersion({ version, env: process.env })}\n`);
