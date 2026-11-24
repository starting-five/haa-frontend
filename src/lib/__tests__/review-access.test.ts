import { describe, expect, it } from "vitest";
import { encodeReviewAccess, parseReviewAccess } from "../review-access";

// The review cookie carries the link's token and the two ids it was issued
// for, nothing else. What the lawyer may see is decided by the backend from the
// token, so the parser's job is only to refuse anything that is not exactly
// that — above all the old cookie, which carried the review's status and
// whether the lawyer could decide, and was trusted.

const access = {
  claimantUserId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  submissionId: "9b2e7c41-5d6a-4f38-8e1b-2c7d9a0f3e55",
  token: "qH3kz1YtV0cP7mR2sB8nW4dL6fJ9xA5e",
};

const cookieOf = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("review access cookie", () => {
  it("round-trips the ids and the token", () => {
    expect(parseReviewAccess(encodeReviewAccess(access))).toEqual(access);
  });

  it("writes nothing but the ids and the token", () => {
    const decoded = JSON.parse(Buffer.from(encodeReviewAccess(access), "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["claimantUserId", "submissionId", "token"]);
  });

  it("refuses the old cookie, whatever status it claims", () => {
    expect(
      parseReviewAccess(
        cookieOf({
          claimantUserId: access.claimantUserId,
          submissionId: access.submissionId,
          assignmentId: "3f1c2b8e-8f5d-4c0a-9d3e-0b6a1e2f4c11",
          status: "accepted",
          canDecide: true,
        })
      )
    ).toBeNull();
  });

  it("keeps only the three fields when more are added", () => {
    expect(parseReviewAccess(cookieOf({ ...access, status: "accepted", access: "full" }))).toEqual(access);
  });

  it("refuses a missing, empty or non-string part", () => {
    expect(parseReviewAccess(cookieOf({ ...access, token: "" }))).toBeNull();
    expect(parseReviewAccess(cookieOf({ ...access, token: 42 }))).toBeNull();
    expect(parseReviewAccess(cookieOf({ claimantUserId: access.claimantUserId, token: access.token }))).toBeNull();
  });

  it("refuses anything that is not the encoded JSON", () => {
    expect(parseReviewAccess(undefined)).toBeNull();
    expect(parseReviewAccess("")).toBeNull();
    expect(parseReviewAccess("not-base64-json")).toBeNull();
    expect(parseReviewAccess(Buffer.from("[1,2,3]").toString("base64url"))).toBeNull();
  });
});
