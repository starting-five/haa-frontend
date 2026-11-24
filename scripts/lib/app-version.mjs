import { spawnSync } from "node:child_process";

// How a build is named. Two identifiers, deliberately kept apart.
//
// The public version is the `version` field of package.json, exactly as a
// person set it: MAJOR.MINOR.PATCH-rcN for a release candidate (0.1.0-rc8),
// MAJOR.MINOR.PATCH-beta for the public beta (0.1.0-beta), MAJOR.MINOR.PATCH
// for a release. It changes once per release candidate, in
// a commit that edits package.json — rc8 to rc9 is that one edit — and it is
// what /api/version reports. Nothing about an individual build is in it.
//
// The build number is internal. It counts the commits from the one that set the
// current version up to HEAD, inclusive, so the bump commit is build 1 and the
// count restarts with every release candidate. It names the image beside its
// commit SHA (the tag <version>.<build>, e.g. 0.1.0-rc8.95), so every image
// still traces to one commit, and it is never part of the public version.
//
// The environment is not part of either. One image carries one version and one
// commit through alpha, beta and production; where it is running is read at
// runtime.
//
// The candidate is written rcN, without a dot, as HAA names its release
// candidates. Semver compares that as text, so tooling that sorts versions
// would put rc10 before rc9; nothing in this pipeline sorts them.

const NUMBER = "(?:0|[1-9]\\d*)";
const BASE_VERSION_PATTERN = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}$`);
const APP_VERSION_PATTERN = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-rc[1-9]\\d*|-beta)?$`);
const BUILD_NUMBER_PATTERN = /^[1-9]\d*$/;

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

/** MAJOR.MINOR.PATCH, with no release-candidate suffix. */
export function validateBaseVersion(value, name = "base version") {
  const normalized = requiredString(value, name);
  if (!BASE_VERSION_PATTERN.test(normalized)) {
    throw new Error(`${name} must be MAJOR.MINOR.PATCH, for example 0.1.0 (received "${normalized}")`);
  }
  return normalized;
}

/** A public version: MAJOR.MINOR.PATCH, MAJOR.MINOR.PATCH-rcN or MAJOR.MINOR.PATCH-beta. */
export function validateAppVersion(value, name = "application version") {
  const normalized = requiredString(value, name);
  if (!APP_VERSION_PATTERN.test(normalized)) {
    throw new Error(`${name} must be MAJOR.MINOR.PATCH, MAJOR.MINOR.PATCH-rcN or MAJOR.MINOR.PATCH-beta, for example 0.1.0-rc8 (received "${normalized}")`);
  }
  return normalized;
}

export function parseAppVersion(value, name = "application version") {
  const normalized = validateAppVersion(value, name);
  const [base, prerelease] = normalized.split("-");
  return {
    version: normalized,
    base,
    // only an rcN suffix is a release candidate; -beta is a prerelease without one
    releaseCandidate: prerelease?.startsWith("rc") ? Number(prerelease.slice("rc".length)) : null,
    isPrerelease: Boolean(prerelease),
  };
}

export function formatAppVersion(base, releaseCandidate) {
  const validBase = validateBaseVersion(base);
  if (releaseCandidate === null || releaseCandidate === undefined) return validBase;
  if (!Number.isInteger(releaseCandidate) || releaseCandidate < 1) {
    throw new Error(`release candidate must be a positive integer (received "${releaseCandidate}")`);
  }
  return `${validBase}-rc${releaseCandidate}`;
}

/** The internal image name for one build of one version, e.g. 0.1.0-rc8.95. */
export function formatBuildTag(version, buildNumber) {
  const validVersion = validateAppVersion(version);
  if (!Number.isInteger(buildNumber) || buildNumber < 1) {
    throw new Error(`build number must be a positive integer (received "${buildNumber}")`);
  }
  return `${validVersion}.${buildNumber}`;
}

/** Runs git in `cwd` and returns trimmed stdout, or throws with git's own message. */
export function createGitRunner(cwd = process.cwd()) {
  return (args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.error) throw new Error(`git ${args.join(" ")} could not run: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
    }
    return result.stdout.trim();
  };
}

function packageVersionAt(git, commit) {
  try {
    const parsed = JSON.parse(git(["show", `${commit}:package.json`]));
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * Counts commits from the one that set the current version up to HEAD,
 * inclusive.
 *
 * A shallow clone cannot answer this — it would silently produce a number that
 * depends on the fetch depth rather than on the history — so it fails loudly
 * instead. CI must check out with fetch-depth: 0.
 */
export function countBuildsSinceVersion(git, version) {
  const validVersion = validateAppVersion(version);

  if (git(["rev-parse", "--is-shallow-repository"]) === "true") {
    throw new Error(
      "Refusing to derive a build number from a shallow clone. " +
        "Check out with fetch-depth: 0, or set HAA_BUILD_NUMBER explicitly."
    );
  }

  const commits = git(["rev-list", "HEAD", "--", "package.json"]).split("\n").filter(Boolean);

  let bumpCommit = null;
  for (const commit of commits) {
    if (packageVersionAt(git, commit) !== validVersion) break;
    bumpCommit = commit;
  }

  // The version exists only in the working tree so far: this build is its first.
  if (!bumpCommit) return 1;

  return Number(git(["rev-list", "--count", `${bumpCommit}..HEAD`])) + 1;
}

/**
 * The public version of the commit checked out: package.json's version.
 * HAA_APP_VERSION overrides it, for the rare build that has to be labelled by
 * hand, and is held to the same format.
 */
export function resolveAppVersion({ version, env = {} }) {
  if (env.HAA_APP_VERSION) return validateAppVersion(env.HAA_APP_VERSION, "HAA_APP_VERSION");
  return validateAppVersion(version, "package.json version");
}

/** The internal build number of the commit checked out. HAA_BUILD_NUMBER overrides it. */
export function resolveBuildNumber({ version, env = {}, git }) {
  if (env.HAA_BUILD_NUMBER) {
    const value = String(env.HAA_BUILD_NUMBER).trim();
    if (!BUILD_NUMBER_PATTERN.test(value)) {
      throw new Error(`HAA_BUILD_NUMBER must be a positive integer (received "${value}")`);
    }
    return Number(value);
  }
  return countBuildsSinceVersion(git, version);
}

/** The internal image tag of the commit checked out: <public version>.<build number>. */
export function resolveBuildTag({ version, env = {}, git }) {
  const appVersion = resolveAppVersion({ version, env });
  return formatBuildTag(appVersion, resolveBuildNumber({ version: appVersion, env, git }));
}
