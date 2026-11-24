import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fails the build when `next build` has frozen an API route into a static
// response.
//
// With cacheComponents on, a GET route handler that touches nothing
// request-specific before it answers is prerendered: its response is written
// to `.next/server/app/api/<route>.body` at build time and served to every
// caller, cached, until the next deploy. That is how the ambassador analytics
// route shipped — it checked for DUB_API_KEY first, the build (correctly) has
// no key, and every ambassador was served the build's zeros, signed in or not.
//
// Every route under /api here answers per request, so none may appear as a
// prerendered artefact. A route that genuinely should be static has to be
// named below, deliberately.

const ALLOWED_STATIC_API_ROUTES = new Set([]);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// `--next-dir <path>` points the check at another build output (used by its tests).
const nextDirArg = process.argv.indexOf("--next-dir");
const nextDir =
  nextDirArg > -1 && process.argv[nextDirArg + 1]
    ? path.resolve(process.argv[nextDirArg + 1])
    : path.join(repositoryRoot, ".next");
const apiOutputDir = path.join(nextDir, "server", "app", "api");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function findBodyFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findBodyFiles(full)));
    else if (entry.name.endsWith(".body")) found.push(full);
  }
  return found;
}

const routeFromBodyFile = (file) =>
  `/api/${path
    .relative(apiOutputDir, file)
    .replace(/\.body$/, "")
    .split(path.sep)
    .join("/")}`;

if (!(await exists(path.join(nextDir, "prerender-manifest.json")))) {
  console.error("check-dynamic-api-routes: no .next/prerender-manifest.json — run `npm run build` first.");
  process.exit(2);
}

const violations = new Map();

if (await exists(apiOutputDir)) {
  for (const file of await findBodyFiles(apiOutputDir)) {
    const route = routeFromBodyFile(file);
    if (!ALLOWED_STATIC_API_ROUTES.has(route)) {
      violations.set(route, `static response written to ${path.relative(nextDir, file)}`);
    }
  }
}

const manifest = JSON.parse(await readFile(path.join(nextDir, "prerender-manifest.json"), "utf8"));
for (const route of Object.keys(manifest.routes ?? {})) {
  if ((route === "/api" || route.startsWith("/api/")) && !ALLOWED_STATIC_API_ROUTES.has(route)) {
    violations.set(route, violations.get(route) ?? "listed as prerendered in .next/prerender-manifest.json");
  }
}

if (violations.size > 0) {
  console.error("check-dynamic-api-routes: these API routes were frozen at build time:");
  for (const [route, why] of violations) console.error(`  ${route} — ${why}`);
  console.error(
    "Make the handler request-time (e.g. `await connection()` from next/server before anything else), " +
      "or add the route to ALLOWED_STATIC_API_ROUTES if it is meant to be static."
  );
  process.exit(1);
}

process.stdout.write("check-dynamic-api-routes: no API route was prerendered.\n");
