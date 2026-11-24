import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The proxy is the only way the browser reaches the backend, so its allowlist
// is a security boundary rather than a convenience list. portal/submissions
// returns every patient's record to any caller that is not itself a patient;
// allowlisting it made that reachable from any session, including a
// self-registered brand ambassador's.

const source = readFileSync("src/app/api/backend/[...path]/route.ts", "utf8");

describe("the backend proxy allowlist", () => {
  it("does not expose the portal's all-patients endpoint to the browser", () => {
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    expect(code).not.toContain("portal/submissions");
  });

  it("still exposes the routes the app actually uses", () => {
    for (const path of ["health", "version", "patient/dashboard", "intake/start", "intake/complete"]) {
      expect(source, path).toContain(`"${path}"`);
    }
  });
});
