// What this build is, and where it is running.
//
// The two halves come from different places on purpose. Version, commit and
// build identity are baked into the image at build time and never change
// afterwards, so the same artefact can be promoted from alpha to beta to
// production and still answer with the commit it was built from. The
// environment is read at request time from deployment configuration, because
// it is the one thing that differs between those deployments.
//
// Nothing here reads the database, runs git, or touches a secret — every
// value is either a build argument or a plain deployment variable, and the
// response is safe to serve publicly.

export const FRONTEND_APPLICATION_NAME = "haa-frontend";

/** Deployments this application knows how to be. Anything else reads as unknown. */
export const KNOWN_ENVIRONMENTS = ["local", "alpha", "beta", "staging", "production"] as const;

export type KnownEnvironment = (typeof KNOWN_ENVIRONMENTS)[number];

export const UNKNOWN = "unknown";

export interface BuildInfo {
  application: string;
  version: string;
  gitSha: string;
  environment: KnownEnvironment | typeof UNKNOWN;
  buildId?: string;
  builtAt?: string;
  imageDigest?: string;
}

export interface BuildEnvironment {
  version?: string;
  gitSha?: string;
  buildId?: string;
  builtAt?: string;
  environment?: string;
  imageDigest?: string;
}

// The public version only — MAJOR.MINOR.PATCH, MAJOR.MINOR.PATCH-rcN or
// MAJOR.MINOR.PATCH-beta (scripts/lib/app-version.mjs). The build number is
// never part of it.
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc[1-9]\d*|-beta)?$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const BUILD_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function normalize(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A value that does not match its shape is reported as unknown rather than
 * echoed back: a version endpoint that repeats whatever is in the environment
 * is a place for something else to end up.
 */
function match(value: string | undefined, pattern: RegExp, transform?: (input: string) => string): string | null {
  const normalized = transform ? transform(normalize(value)) : normalize(value);
  return normalized && pattern.test(normalized) ? normalized : null;
}

function readEnvironment(value: string | undefined): KnownEnvironment | typeof UNKNOWN {
  const normalized = normalize(value).toLowerCase();
  return (KNOWN_ENVIRONMENTS as readonly string[]).includes(normalized) ? (normalized as KnownEnvironment) : UNKNOWN;
}

function readBuiltAt(value: string | undefined): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * NEXT_PUBLIC_* values are inlined at build time, so they must be written as
 * complete member expressions — reading them through a variable key would
 * leave the container with nothing. HAA_* are ordinary runtime variables.
 */
export function readBuildEnvironment(): BuildEnvironment {
  return {
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    gitSha: process.env.NEXT_PUBLIC_FRONTEND_SHA,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID,
    builtAt: process.env.NEXT_PUBLIC_BUILT_AT,
    environment: process.env.HAA_ENVIRONMENT,
    imageDigest: process.env.HAA_IMAGE_DIGEST,
  };
}

export function getBuildInfo(source: BuildEnvironment = readBuildEnvironment()): BuildInfo {
  const buildId = match(source.buildId, BUILD_ID_PATTERN);
  const builtAt = readBuiltAt(source.builtAt);
  const imageDigest = match(source.imageDigest, IMAGE_DIGEST_PATTERN, (input) => input.toLowerCase());

  return {
    application: FRONTEND_APPLICATION_NAME,
    version: match(source.version, VERSION_PATTERN) ?? UNKNOWN,
    gitSha: match(source.gitSha, GIT_SHA_PATTERN, (input) => input.toLowerCase()) ?? UNKNOWN,
    environment: readEnvironment(source.environment),
    ...(buildId ? { buildId } : {}),
    ...(builtAt ? { builtAt } : {}),
    ...(imageDigest ? { imageDigest } : {}),
  };
}
