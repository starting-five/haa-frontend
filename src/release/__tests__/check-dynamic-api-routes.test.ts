// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// The build guard behind `npm run check:dynamic-api-routes`, which CI and the
// Dockerfile run straight after `next build`. The ambassador analytics route
// shipped as a prerendered `.body` of zeros; a build that produces one again
// must fail, not deploy.

const script = path.resolve(__dirname, "../../../scripts/check-dynamic-api-routes.mjs");
const made: string[] = [];

const fakeBuild = (files: Record<string, string>, prerenderedRoutes: string[] = []) => {
  const dir = mkdtempSync(path.join(tmpdir(), "next-build-"));
  made.push(dir);
  writeFileSync(
    path.join(dir, "prerender-manifest.json"),
    JSON.stringify({ version: 4, routes: Object.fromEntries(prerenderedRoutes.map((route) => [route, {}])) })
  );
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
};

const check = (nextDir: string) => spawnSync(process.execPath, [script, "--next-dir", nextDir], { encoding: "utf8" });

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("check-dynamic-api-routes", () => {
  it("fails a build that froze the analytics route into a static response", () => {
    const build = fakeBuild({
      "server/app/api/ambassadors/analytics.body": '{"clicks":0,"scans":0,"totalClicksAndScans":0,"leads":0}',
    });

    const result = check(build);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("/api/ambassadors/analytics");
  });

  it("fails a build whose prerender manifest lists an API route", () => {
    const result = check(fakeBuild({}, ["/api/version", "/robots.txt"]));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("/api/version");
    expect(result.stderr).not.toContain("/robots.txt");
  });

  it("passes a build where every API route is request-time", () => {
    const build = fakeBuild(
      {
        "server/app/api/ambassadors/analytics/route.js": "// dynamic handler",
        "server/app/robots.txt.body": "User-Agent: *\nDisallow: /",
      },
      ["/robots.txt", "/en/get-help"]
    );

    const result = check(build);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no API route was prerendered");
  });

  it("refuses to pass when there is no build to check", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "no-build-"));
    made.push(empty);

    expect(check(empty).status).toBe(2);
  });
});
