import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A NEXT_PUBLIC_* value is compiled into the bundle by `next build`. One the
// app reads but the image build never passes is not "unset at runtime" — it is
// missing from every image, and no runtime env can put it back. HP#129 shipped
// exactly that: NEXT_PUBLIC_AMBASSADOR_LINK_HOST was read by the ambassador
// screens, set for the unit tests, and absent from the Docker build, so the
// image built and the screens failed in the browser.
//
// This holds the three places in step: every NEXT_PUBLIC_* the app reads is a
// Dockerfile ARG, exported to `next build` as ENV, and passed by the CI image
// build as a --build-arg.

const root = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" || entry === "test-utils" ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx|mjs|js)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const publicVarsReadByApp = () => {
  const names = new Set<string>();
  for (const file of [...sourceFiles(path.join(root, "src")), path.join(root, "next.config.ts")]) {
    for (const match of readFileSync(file, "utf8").matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
};

const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
const workflow = readFileSync(path.join(root, ".github/workflows/docker-image.yml"), "utf8");
// the image build's own command, not any other step of the workflow
const imageBuild = workflow.slice(workflow.indexOf("docker build \\"), workflow.indexOf("docker push"));

describe("public build configuration", () => {
  const vars = publicVarsReadByApp();

  it("finds the public values the app reads, the ambassador link host among them", () => {
    expect(vars).toContain("NEXT_PUBLIC_AMBASSADOR_LINK_HOST");
    expect(vars).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(imageBuild).toContain("docker build");
  });

  it.each(vars)("%s is a Dockerfile ARG exported to next build", (name) => {
    expect(dockerfile).toMatch(new RegExp(`^ARG ${name}(=.*)?$`, "m"));
    expect(dockerfile).toMatch(new RegExp(`^ENV ${name}=\\$${name}$`, "m"));
  });

  it.each(vars)("%s is passed to the CI image build", (name) => {
    expect(imageBuild).toMatch(new RegExp(`--build-arg ${name}=`));
  });

  it("takes the ambassador link host from a repository variable, required before the image is built", () => {
    expect(workflow).toMatch(
      /^ {2}NEXT_PUBLIC_AMBASSADOR_LINK_HOST: \$\{\{ vars\.NEXT_PUBLIC_AMBASSADOR_LINK_HOST \}\}$/m
    );
    expect(workflow).toContain(
      ': "${NEXT_PUBLIC_AMBASSADOR_LINK_HOST:?NEXT_PUBLIC_AMBASSADOR_LINK_HOST repository variable is required}"'
    );
  });

  it("documents the ambassador link host in .env.example", () => {
    expect(readFileSync(path.join(root, ".env.example"), "utf8")).toMatch(/^NEXT_PUBLIC_AMBASSADOR_LINK_HOST=$/m);
  });
});
