import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import {
  countBuildsSinceVersion,
  createGitRunner,
  formatAppVersion,
  formatBuildTag,
  parseAppVersion,
  resolveAppVersion,
  resolveBuildNumber,
  resolveBuildTag,
  validateAppVersion,
  validateBaseVersion,
} from "../../../scripts/lib/app-version.mjs";

// Two identifiers, kept apart: the public version is package.json's version
// (0.1.0-rc8), and the internal build number counts commits since that version
// was set. The build number is derived from real history, so the tests build
// real repositories: a fake git runner would only prove the fake.

const temporaryDirectories: string[] = [];

async function createRepository(): Promise<{
  directory: string;
  git: (args: string[]) => string;
  commit: (version: string | null, message: string) => Promise<void>;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "haa-app-version-"));
  temporaryDirectories.push(directory);

  const run = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };

  run(["init", "--initial-branch=main"]);
  run(["config", "user.email", "release@example.test"]);
  run(["config", "user.name", "Release"]);

  let fileCounter = 0;
  const commit = async (version: string | null, message: string) => {
    if (version) {
      await writeFile(path.join(directory, "package.json"), `${JSON.stringify({ name: "app", version }, null, 2)}\n`);
      run(["add", "package.json"]);
    } else {
      fileCounter += 1;
      await writeFile(path.join(directory, `change-${fileCounter}.txt`), message);
      run(["add", `change-${fileCounter}.txt`]);
    }
    run(["commit", "-m", message]);
  };

  return { directory, git: createGitRunner(directory), commit };
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("public version format", () => {
  it("is MAJOR.MINOR.PATCH-rcN, MAJOR.MINOR.PATCH-beta or MAJOR.MINOR.PATCH, and nothing else", () => {
    expect(validateAppVersion("0.1.0-rc8")).toBe("0.1.0-rc8");
    expect(validateAppVersion("0.1.0-beta")).toBe("0.1.0-beta");
    expect(validateAppVersion(" 0.1.0-rc12 ")).toBe("0.1.0-rc12");
    expect(validateAppVersion("0.1.0")).toBe("0.1.0");

    for (const invalid of [
      "1.0.0-rc.95", // the old build-number format
      "0.1.0-rc8.95", // a build tag is not a public version
      "0.1.0-rc0",
      "0.1.0-rc",
      "0.1.0-RC8",
      "0.1.0-beta1",
      "0.1.0-Beta",
      "0.1.0-beta.1", // a beta build tag is not a public version either
      "0.1.0-beta-rc1",
      "v0.1.0-rc8",
      "0.1-rc8",
      "00.1.0-rc8",
      "",
    ]) {
      expect(() => validateAppVersion(invalid), invalid).toThrow();
    }
    expect(validateBaseVersion("0.1.0")).toBe("0.1.0");
    expect(() => validateBaseVersion("0.1.0-rc8")).toThrow(/MAJOR\.MINOR\.PATCH/);
  });

  it("parses the release candidate out of the version", () => {
    expect(parseAppVersion("0.1.0-rc8")).toEqual({
      version: "0.1.0-rc8",
      base: "0.1.0",
      releaseCandidate: 8,
      isPrerelease: true,
    });
    // the public beta is a prerelease, but not a release candidate
    expect(parseAppVersion("0.1.0-beta")).toEqual({
      version: "0.1.0-beta",
      base: "0.1.0",
      releaseCandidate: null,
      isPrerelease: true,
    });
    expect(parseAppVersion("0.1.0")).toEqual({
      version: "0.1.0",
      base: "0.1.0",
      releaseCandidate: null,
      isPrerelease: false,
    });
  });

  it("formats rc8, the next candidate rc9, and a release", () => {
    expect(formatAppVersion("0.1.0", 8)).toBe("0.1.0-rc8");
    const next = parseAppVersion("0.1.0-rc8");
    expect(formatAppVersion(next.base, (next.releaseCandidate ?? 0) + 1)).toBe("0.1.0-rc9");
    expect(formatAppVersion("0.1.0", 10)).toBe("0.1.0-rc10");
    expect(formatAppVersion("0.1.0", null)).toBe("0.1.0");
    expect(() => formatAppVersion("0.1.0", 0)).toThrow(/positive integer/);
  });

  it("carries no environment and no build — one build is one version everywhere it runs", () => {
    expect(() => validateAppVersion("0.1.0-rc8+beta")).toThrow();
    expect(() => validateAppVersion("0.1.0-rc8.95")).toThrow();
  });

  it("is what this repository's package.json says: release candidate 3 of 0.1.1, 0.1.1-rc3", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe("0.1.1-rc3");
    expect(resolveAppVersion({ version: pkg.version, env: {} })).toBe("0.1.1-rc3");
  });
});

describe("internal build tag", () => {
  it("is <public version>.<build number>, kept out of the public version", () => {
    expect(formatBuildTag("0.1.0-rc8", 95)).toBe("0.1.0-rc8.95");
    expect(() => formatBuildTag("0.1.0-rc8", 0)).toThrow(/positive integer/);
    expect(() => formatBuildTag("1.0.0-rc.95", 1)).toThrow();
  });
});

describe("build number derivation", () => {
  it("counts the commit that set the version as build 1 and each later commit as the next", async () => {
    const repository = await createRepository();
    await repository.commit("0.1.0-rc8", "Release candidate 8");
    expect(countBuildsSinceVersion(repository.git, "0.1.0-rc8")).toBe(1);

    await repository.commit(null, "First change");
    expect(countBuildsSinceVersion(repository.git, "0.1.0-rc8")).toBe(2);

    await repository.commit(null, "Second change");
    await repository.commit(null, "Third change");
    expect(countBuildsSinceVersion(repository.git, "0.1.0-rc8")).toBe(4);
    expect(resolveBuildTag({ version: "0.1.0-rc8", env: {}, git: repository.git })).toBe("0.1.0-rc8.4");
  });

  it("moves to rc9 with one package.json edit, and the build count restarts", async () => {
    const repository = await createRepository();
    await repository.commit("0.1.0-rc8", "Release candidate 8");
    await repository.commit(null, "Work");
    await repository.commit(null, "More work");
    expect(resolveBuildTag({ version: "0.1.0-rc8", env: {}, git: repository.git })).toBe("0.1.0-rc8.3");

    await repository.commit("0.1.0-rc9", "Release candidate 9");
    expect(resolveAppVersion({ version: "0.1.0-rc9", env: {} })).toBe("0.1.0-rc9");
    expect(resolveBuildTag({ version: "0.1.0-rc9", env: {}, git: repository.git })).toBe("0.1.0-rc9.1");

    await repository.commit(null, "Work on rc9");
    expect(resolveBuildTag({ version: "0.1.0-rc9", env: {}, git: repository.git })).toBe("0.1.0-rc9.2");
    // the public version did not move with the build
    expect(resolveAppVersion({ version: "0.1.0-rc9", env: {} })).toBe("0.1.0-rc9");
  });

  it("moves from rc10 to the public beta with one package.json edit, and the build count restarts", async () => {
    const repository = await createRepository();
    await repository.commit("0.1.0-rc10", "Release candidate 10");
    await repository.commit(null, "Work");
    expect(resolveBuildTag({ version: "0.1.0-rc10", env: {}, git: repository.git })).toBe("0.1.0-rc10.2");

    await repository.commit("0.1.0-beta", "Public beta");
    expect(resolveAppVersion({ version: "0.1.0-beta", env: {} })).toBe("0.1.0-beta");
    expect(resolveBuildTag({ version: "0.1.0-beta", env: {}, git: repository.git })).toBe("0.1.0-beta.1");

    await repository.commit(null, "Work on the beta");
    expect(resolveBuildTag({ version: "0.1.0-beta", env: {}, git: repository.git })).toBe("0.1.0-beta.2");
    // the public version did not move with the build
    expect(resolveAppVersion({ version: "0.1.0-beta", env: {} })).toBe("0.1.0-beta");
  });

  it("is the same answer for the same commit, whoever runs it", async () => {
    const repository = await createRepository();
    await repository.commit("0.1.0-rc8", "Release candidate 8");
    await repository.commit(null, "Work");

    const first = resolveBuildTag({ version: "0.1.0-rc8", env: {}, git: repository.git });
    expect(first).toBe("0.1.0-rc8.2");
    expect(resolveBuildTag({ version: "0.1.0-rc8", env: {}, git: repository.git })).toBe(first);
  });

  it("treats a version that exists only in the working tree as its first build", async () => {
    const repository = await createRepository();
    await repository.commit("0.1.0-rc8", "Release candidate 8");
    await repository.commit(null, "Work");
    // package.json bumped locally but not yet committed
    expect(countBuildsSinceVersion(repository.git, "0.1.0-rc9")).toBe(1);
  });

  it("refuses a shallow clone instead of returning a number that depends on fetch depth", async () => {
    const source = await createRepository();
    await source.commit("0.1.0-rc8", "Release candidate 8");
    await source.commit(null, "Work");
    await source.commit(null, "More work");

    const directory = await mkdtemp(path.join(os.tmpdir(), "haa-app-version-shallow-"));
    temporaryDirectories.push(directory);
    const clonePath = path.join(directory, "shallow");
    const clone = spawnSync("git", ["clone", "--depth", "1", `file://${source.directory}`, clonePath], {
      encoding: "utf8",
    });
    expect(clone.status).toBe(0);

    expect(() => countBuildsSinceVersion(createGitRunner(clonePath), "0.1.0-rc8")).toThrow(/shallow/i);
    // unless the pipeline says which build it is
    expect(
      resolveBuildNumber({ version: "0.1.0-rc8", env: { HAA_BUILD_NUMBER: "7" }, git: createGitRunner(clonePath) })
    ).toBe(7);
  });
});

describe("version resolution", () => {
  it("is package.json's version, independent of how many commits followed it", async () => {
    const repository = await createRepository();
    await repository.commit("0.1.0-rc8", "Release candidate 8");
    for (let i = 0; i < 5; i += 1) await repository.commit(null, `Work ${i}`);

    expect(resolveAppVersion({ version: "0.1.0-rc8", env: {} })).toBe("0.1.0-rc8");
    expect(resolveBuildTag({ version: "0.1.0-rc8", env: {}, git: repository.git })).toBe("0.1.0-rc8.6");
  });

  it("honours explicit overrides, and validates them", () => {
    expect(resolveAppVersion({ version: "0.1.0-rc8", env: { HAA_APP_VERSION: "0.2.0-rc1" } })).toBe("0.2.0-rc1");
    expect(() => resolveAppVersion({ version: "0.1.0-rc8", env: { HAA_APP_VERSION: "nightly" } })).toThrow(
      /HAA_APP_VERSION/
    );
    expect(() => resolveAppVersion({ version: "0.1.0-rc8", env: { HAA_APP_VERSION: "1.0.0-rc.95" } })).toThrow(
      /HAA_APP_VERSION/
    );
    expect(() => resolveBuildNumber({ version: "0.1.0-rc8", env: { HAA_BUILD_NUMBER: "rc8" }, git: () => "" })).toThrow(
      /HAA_BUILD_NUMBER/
    );
  });

  it("refuses an unusable package.json version", () => {
    expect(() => resolveAppVersion({ version: undefined, env: {} })).toThrow(/required/);
    expect(() => resolveAppVersion({ version: "1.0.0-rc.95", env: {} })).toThrow(/rcN/);
  });
});
