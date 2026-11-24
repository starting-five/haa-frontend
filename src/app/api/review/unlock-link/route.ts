import { DEFAULT_LOCALE, LOCALE_CODES } from "@/i18n/locales";
import { getApiBaseUrl } from "@/lib/backend-api";
import { resolveRequestOrigin } from "@/lib/request-origin";
import { UUID_PATTERN } from "@/lib/constants";
import { encodeReviewAccess, REVIEW_ACCESS_COOKIE, REVIEW_ACCESS_MAX_AGE_SECONDS } from "@/lib/review-access";
import { NextResponse } from "next/server";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Where a verified link lands: always this case's own review page. `next` used
// to be redirected to after a check for a leading "/" and no "//", which "/\x"
// and "/<tab>/x" pass and a URL parser then reads as another host. Now the only
// thing read from it is which of our locales it starts with; the path is built
// here from the ids the backend has just verified, so no value in the link —
// absolute, protocol-relative, backslashed, encoded or malformed — can send the
// browser anywhere else.
function reviewDestination(next: string, claimantUserId: string, submissionId: string): string {
  const locale = LOCALE_CODES.find((code) => next === `/${code}` || next.startsWith(`/${code}/`)) ?? DEFAULT_LOCALE;
  return `/${locale}/review/${encodeURIComponent(claimantUserId)}?submissionId=${encodeURIComponent(submissionId)}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolveRequestOrigin(request);
  const claimantUserId = asString(url.searchParams.get("claimantUserId"));
  const submissionId = asString(url.searchParams.get("submissionId"));
  const token = asString(url.searchParams.get("t"));
  const next = url.searchParams.get("next") ?? "";

  if (
    !claimantUserId ||
    !submissionId ||
    !token ||
    !UUID_PATTERN.test(claimantUserId) ||
    !UUID_PATTERN.test(submissionId)
  ) {
    const response = NextResponse.redirect(new URL("/", origin));
    response.cookies.delete(REVIEW_ACCESS_COOKIE);
    return response;
  }

  try {
    const verifyResponse = await fetch(`${getApiBaseUrl()}/portal/review-access/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimantUserId, submissionId, token }),
      cache: "no-store",
    });

    const verifyPayload = (await verifyResponse.json().catch(() => null)) as
      | {
          ok: true;
          assignmentId: string;
          submissionId: string;
          claimantUserId: string;
          status?: string;
          canDecide?: boolean;
        }
      | { ok?: false; error?: string }
      | null;

    if (!verifyResponse.ok || !verifyPayload || verifyPayload.ok !== true) {
      const response = NextResponse.redirect(new URL("/", origin));
      response.cookies.delete(REVIEW_ACCESS_COOKIE);
      return response;
    }

    // The token is kept, not what verify said about it: the review page asks
    // the backend again on every render, so a decision, a revocation or an
    // expiry after this point is seen at once.
    const cookieValue = encodeReviewAccess({ claimantUserId, submissionId, token });

    const response = NextResponse.redirect(new URL(reviewDestination(next, claimantUserId, submissionId), origin));
    response.cookies.set(REVIEW_ACCESS_COOKIE, cookieValue, {
      httpOnly: true,
      secure: new URL(origin).protocol === "https:" || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REVIEW_ACCESS_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/", origin));
    response.cookies.delete(REVIEW_ACCESS_COOKIE);
    return response;
  }
}
