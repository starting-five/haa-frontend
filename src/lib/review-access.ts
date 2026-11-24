// The lawyer review link's cookie.
//
// A review link carries the case's two ids and a token. Once the backend has
// verified the link, all three are kept here — HttpOnly, so no script on the
// page can read them — and the review page and the decision route send them
// back to the backend on every request. The backend decides from the token
// alone what the lawyer may see and do; nothing else in the cookie is trusted.
//
// The cookie is not signed and does not need to be: it holds nothing the
// lawyer's own link did not already hold, and a value edited in the browser is
// a token the backend does not recognise.

export const REVIEW_ACCESS_COOKIE = "haa_review_access";
export const REVIEW_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 8;

export type ReviewAccess = {
  claimantUserId: string;
  submissionId: string;
  token: string;
};

export function encodeReviewAccess(access: ReviewAccess): string {
  return Buffer.from(
    JSON.stringify({ claimantUserId: access.claimantUserId, submissionId: access.submissionId, token: access.token })
  ).toString("base64url");
}

export function parseReviewAccess(rawValue: string | undefined): ReviewAccess | null {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(Buffer.from(rawValue, "base64url").toString("utf8")) as Record<string, unknown>;
    const { claimantUserId, submissionId, token } = parsed;
    if (typeof claimantUserId !== "string" || typeof submissionId !== "string" || typeof token !== "string") {
      return null;
    }
    if (!claimantUserId || !submissionId || !token) return null;
    return { claimantUserId, submissionId, token };
  } catch {
    return null;
  }
}
