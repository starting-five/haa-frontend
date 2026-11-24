import { getApiBaseUrl } from "@/lib/backend-api";
import { encodeReviewAccess, REVIEW_ACCESS_COOKIE, REVIEW_ACCESS_MAX_AGE_SECONDS } from "@/lib/review-access";
import { NextResponse } from "next/server";

type VerifyAccessSuccess = {
  ok: true;
  assignmentId: string;
  submissionId: string;
  claimantUserId: string;
  status?: string;
  canDecide?: boolean;
};

type VerifyAccessFailure = {
  ok?: false;
  error?: string;
};

function isVerifyAccessSuccess(value: unknown): value is VerifyAccessSuccess {
  if (!value || typeof value !== "object") return false;

  const payload = value as Partial<VerifyAccessSuccess>;
  return (
    payload.ok === true &&
    typeof payload.assignmentId === "string" &&
    typeof payload.submissionId === "string" &&
    typeof payload.claimantUserId === "string"
  );
}

function readVerifyError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const maybeError = (value as { error?: unknown }).error;
  return typeof maybeError === "string" && maybeError.trim() ? maybeError : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    claimantUserId?: unknown;
    submissionId?: unknown;
    token?: unknown;
  } | null;
  const claimantUserId = asString(body?.claimantUserId);
  const submissionId = asString(body?.submissionId);
  const token = asString(body?.token);

  if (!claimantUserId || !submissionId || !token) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const verifyResponse = await fetch(`${getApiBaseUrl()}/portal/review-access/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimantUserId, submissionId, token }),
      cache: "no-store",
    });
    const verifyPayload = (await verifyResponse.json().catch(() => null)) as
      VerifyAccessSuccess | VerifyAccessFailure | null;

    if (!verifyResponse.ok || !isVerifyAccessSuccess(verifyPayload)) {
      return NextResponse.json(
        { ok: false, error: readVerifyError(verifyPayload) ?? "invalid_token" },
        { status: 401 }
      );
    }

    const cookieValue = encodeReviewAccess({ claimantUserId, submissionId, token });

    const response = NextResponse.json(
      { ok: true, status: verifyPayload.status, canDecide: verifyPayload.canDecide },
      { status: 200 }
    );
    response.cookies.set(REVIEW_ACCESS_COOKIE, cookieValue, {
      httpOnly: true,
      secure: request.url.startsWith("https://") || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REVIEW_ACCESS_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "backend_unavailable" }, { status: 502 });
  }
}
