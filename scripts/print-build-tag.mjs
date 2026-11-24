import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGitRunner, resolveBuildTag } from "./lib/app-version.mjs";

// Prints the internal tag of the commit checked out — <public version>.<build
// number>, e.g. 0.1.0-rc8.95 — for the pipeline to tag the image with beside
// its commit SHA. It is never the public version.

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));

process.stdout.write(`${resolveBuildTag({ version, env: process.env, git: createGitRunner(repositoryRoot) })}\n`);
