const gitShaPattern = /^[0-9a-f]{40}$/i;
const imageDigestPattern = /^sha256:[0-9a-f]{64}$/i;

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function validateGitSha(value, name) {
  const normalized = requiredString(value, name).toLowerCase();
  if (!gitShaPattern.test(normalized)) {
    throw new Error(`${name} must be a 40-character Git SHA`);
  }
  return normalized;
}

export function validateImageDigest(value, name) {
  const normalized = requiredString(value, name).toLowerCase();
  if (!imageDigestPattern.test(normalized)) {
    throw new Error(`${name} must be a sha256 digest`);
  }
  return normalized;
}

export function validateDeploymentUrl(value, name) {
  const raw = requiredString(value, name);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be a credential-free HTTPS origin`);
  }
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname)) {
    throw new Error(`${name} must identify a deployed environment`);
  }

  return url.origin;
}

function assertExactKeys(value, expectedKeys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${name} contains missing or unexpected fields`);
  }
}

/** @param {Record<string, string | undefined>} environment */
export function createCompatibilityManifest(environment) {
  return {
    frontendSha: validateGitSha(environment.FRONTEND_SHA, "FRONTEND_SHA"),
    backendSha: validateGitSha(environment.BACKEND_SHA, "BACKEND_SHA"),
    backendImageDigest: validateImageDigest(environment.BACKEND_IMAGE_DIGEST, "BACKEND_IMAGE_DIGEST"),
    stagingUrl: validateDeploymentUrl(environment.STAGING_BACKEND_URL, "STAGING_BACKEND_URL"),
    result: "pass",
  };
}

export function validateCompatibilityManifest(value) {
  assertExactKeys(
    value,
    ["frontendSha", "backendSha", "backendImageDigest", "stagingUrl", "result"],
    "Compatibility manifest"
  );
  if (value.result !== "pass") {
    throw new Error("Compatibility manifest result must be pass");
  }
  return createCompatibilityManifest({
    FRONTEND_SHA: value.frontendSha,
    BACKEND_SHA: value.backendSha,
    BACKEND_IMAGE_DIGEST: value.backendImageDigest,
    STAGING_BACKEND_URL: value.stagingUrl,
  });
}

/** @param {Record<string, string | undefined>} environment */
export function createReleaseRecord(environment) {
  return {
    frontendSha: validateGitSha(environment.FRONTEND_SHA, "FRONTEND_SHA"),
    frontendImageDigest: validateImageDigest(environment.FRONTEND_IMAGE_DIGEST, "FRONTEND_IMAGE_DIGEST"),
    backendSha: validateGitSha(environment.BACKEND_SHA, "BACKEND_SHA"),
    backendImageDigest: validateImageDigest(environment.BACKEND_IMAGE_DIGEST, "BACKEND_IMAGE_DIGEST"),
    stagingFrontendUrl: validateDeploymentUrl(environment.STAGING_FRONTEND_URL, "STAGING_FRONTEND_URL"),
    stagingBackendUrl: validateDeploymentUrl(environment.STAGING_BACKEND_URL, "STAGING_BACKEND_URL"),
    compatibilityResult: "pass",
  };
}

export function validateReleaseRecord(value) {
  assertExactKeys(
    value,
    [
      "frontendSha",
      "frontendImageDigest",
      "backendSha",
      "backendImageDigest",
      "stagingFrontendUrl",
      "stagingBackendUrl",
      "compatibilityResult",
    ],
    "Release record"
  );
  if (value.compatibilityResult !== "pass") {
    throw new Error("Release record compatibilityResult must be pass");
  }
  return createReleaseRecord({
    FRONTEND_SHA: value.frontendSha,
    FRONTEND_IMAGE_DIGEST: value.frontendImageDigest,
    BACKEND_SHA: value.backendSha,
    BACKEND_IMAGE_DIGEST: value.backendImageDigest,
    STAGING_FRONTEND_URL: value.stagingFrontendUrl,
    STAGING_BACKEND_URL: value.stagingBackendUrl,
  });
}

export function serializeMetadata(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
