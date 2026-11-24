import { z } from "zod";
import {
  agreementPayloadSchema,
  agreementStatusResponseSchema,
  apiErrorSchema,
  caseDataSchema,
  caseSummarySchema,
  caseSummaryUpdatePayloadSchema,
  createAgreementResponseSchema,
  verifyOtpPayloadSchema,
  verifyOtpResponseSchema,
  checkEmailPayloadSchema,
  checkEmailResponseSchema,
  completeIntakePayloadSchema,
  deleteDocumentPayloadSchema,
  documentUploadUrlPayloadSchema,
  documentUploadUrlResponseSchema,
  intakePayloadSchema,
  intakeResponseSchema,
  lawyerReviewCaseSchema,
  patientDashboardSchema,
  patientIntakeResumeSchema,
  registerPayloadSchema,
  registerResponseSchema,
  registrationStatusPayloadSchema,
  registrationStatusResponseSchema,
  startIntakePayloadSchema,
  submissionsSchema,
  type AgreementStatus,
  type CaseData,
  type CaseSummary,
  type CaseSummaryUpdatePayload,
  type CheckEmailResponse,
  type DocumentUploadUrl,
  type LawyerReviewCase,
  type PatientDashboard,
  type PatientIntakeResume,
  type RegisterResponse,
  type RegistrationStatus,
  type SubmissionSummary,
  signingEmbedSchema,
} from "@/contracts/intake";
import type { UploadedFile } from "@/types/intake";
import type { LocationDetails } from "@/types/location";
import { getApiBaseUrl } from "@/lib/backend-api";
import { createClient } from "@/lib/supabase/client";

export type {
  AgreementStatus,
  CaseData,
  CaseSummary,
  CaseSummaryUpdatePayload,
  CheckEmailResponse,
  DocumentUploadUrl,
  IntakeResponse,
  LawyerReviewCase,
  PatientDashboard,
  PatientIntakeResume,
  RegisterResponse,
  RegistrationStatus,
  SubmissionSummary,
} from "@/contracts/intake";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`Backend returned invalid JSON (status ${response.status})`);
  }
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => undefined);
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success ? (parsed.data.message ?? parsed.data.error) : fallback;
}

export interface StartIntakePayload {
  locale: string;
  claimant: {
    firstName: string;
    lastName: string;
    mobile: string;
    email?: string;
  };
  // Absent on the call that opens the case at verification, present on the one
  // the location screen makes once the accident screens have been answered.
  accident?: {
    incidentType: string;
    incidentDate: string;
    incidentLocation: string;
    incidentLocationDetails?: LocationDetails | null;
    description?: string;
    injuries?: string;
    insuranceStatus?: string;
    insuranceDetails?: string;
    role?: string;
  };
}

export type StartIntakeResult = { existing: true } | { existing: false; submissionId: string };

export interface CompleteIntakePayload {
  submissionId: string;
  claimant: {
    residence?: string;
    residenceLocationDetails?: LocationDetails | null;
  };
  accident: {
    incidentType: string;
    incidentDate: string;
    incidentLocation: string;
    incidentLocationDetails?: LocationDetails | null;
    role?: string;
    description?: string;
    injuries?: string;
    injuryTypes?: string;
  };
  treatmentArea?: string;
  treatmentAreaLocationDetails?: LocationDetails | null;
  companions?: Array<{
    firstName: string;
    lastName: string;
    relation: string;
    cellNumber: string;
    email?: string;
  }>;
  documents: UploadedFile[];
}

export interface CheckEmailPayload {
  email: string;
  firstName: string;
  lastName: string;
  mobile: string;
  practice?: string;
  role: string;
}

export interface IntakePayload {
  submissionId: string;
  locale: string;
  claimant: {
    firstName: string;
    lastName: string;
    mobile: string;
    email?: string;
    city?: string;
    state?: string;
    consent: true;
    contactMethod?: string;
    treatmentArea?: string;
  };
  accident: {
    incidentType: string;
    incidentDate: string;
    incidentLocation: string;
    description?: string;
    injuries?: string;
    insuranceStatus?: string;
    insuranceDetails?: string;
    role?: string;
  };
  documents: UploadedFile[];
}

export async function submitIntake(payload: IntakePayload): Promise<void> {
  intakePayloadSchema.parse(payload);
  const res = await fetch(`${getApiBaseUrl()}/intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Request failed with status ${res.status}`));
  }

  // Validate the response contract — throws if backend changes the shape
  intakeResponseSchema.parse(await readJson(res));
}

export async function getSubmissions(accessToken: string): Promise<SubmissionSummary[]> {
  const res = await fetch(`${getApiBaseUrl()}/portal/submissions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to load submissions");
  }

  return submissionsSchema.parse(await readJson(res));
}

/**
 * The caller's own case summary. `accessToken` is for server components, which
 * have no browser client to read the session from; in the browser it is omitted
 * and the session is read the same way every other patient call reads it.
 */
export async function getCase(submissionId: string, accessToken?: string): Promise<CaseData> {
  const res = await fetch(`${getApiBaseUrl()}/case/${encodeURIComponent(submissionId)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : await authorizationHeader(),
  });

  if (!res.ok) {
    throw new Error("Case not found");
  }

  return caseDataSchema.parse(await readJson(res));
}

/**
 * The patient's own case as Case Summary shows it. Called by the server page
 * with the token from the request cookies; a case the caller does not own is
 * answered exactly like a missing one, and both throw.
 */
export async function getCaseSummary(submissionId: string, accessToken?: string): Promise<CaseSummary> {
  const res = await fetch(`${getApiBaseUrl()}/case/${encodeURIComponent(submissionId)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : await authorizationHeader(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Case not found");
  }

  return caseSummarySchema.parse(await readJson(res));
}

/** A refused save, carrying the backend's code: case_locked, field_not_editable, invalid_name, … */
export class CaseSummarySaveError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CaseSummarySaveError";
  }
}

/**
 * Case Summary's Save. The payload is parsed strictly first, so a body naming
 * anything the backend does not accept — email and phone included — never
 * leaves the browser. Returns the stored case as the backend now holds it.
 */
export async function saveCaseSummary(submissionId: string, payload: CaseSummaryUpdatePayload): Promise<CaseSummary> {
  const body = caseSummaryUpdatePayloadSchema.parse(payload);
  const res = await fetch(`${getApiBaseUrl()}/case/${encodeURIComponent(submissionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authorizationHeader()) },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new CaseSummarySaveError(await readErrorCode(res));
  }

  return caseSummarySchema.parse(await readJson(res));
}

export type LawyerReviewCaseResult =
  { ok: true; reviewCase: LawyerReviewCase } | { ok: false; code: "denied" | "unavailable" };

/**
 * The case as a lawyer's review link may see it. Server-side only: the token
 * comes from the HttpOnly review cookie and is sent to the backend, never to the
 * browser. The backend decides what is returned. A link it refuses is "denied";
 * anything else that is not a well-formed case — including a masked answer
 * carrying a field it must not — is "unavailable" and nothing is rendered.
 */
export async function getLawyerReviewCase(access: {
  claimantUserId: string;
  submissionId: string;
  token: string;
}): Promise<LawyerReviewCaseResult> {
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/portal/review-case`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimantUserId: access.claimantUserId,
        submissionId: access.submissionId,
        token: access.token,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unavailable" };
  }

  if (res.status === 400 || res.status === 401 || res.status === 404) {
    return { ok: false, code: "denied" };
  }

  if (!res.ok) {
    return { ok: false, code: "unavailable" };
  }

  const parsed = lawyerReviewCaseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? { ok: true, reviewCase: parsed.data } : { ok: false, code: "unavailable" };
}

export class PatientDashboardUnavailableError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PatientDashboardUnavailableError";
  }
}

export async function getPatientDashboard(): Promise<PatientDashboard> {
  const res = await fetch(`${getApiBaseUrl()}/patient/dashboard`, {
    headers: await authorizationHeader(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new PatientDashboardUnavailableError(parsed.data.error);
    }
    throw new Error(`Dashboard request failed with status ${res.status}`);
  }

  return patientDashboardSchema.parse(await readJson(res));
}

export async function getPatientIntakeResume(): Promise<PatientIntakeResume> {
  const res = await fetch(`${getApiBaseUrl()}/patient/intake-resume`, {
    headers: await authorizationHeader(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new PatientDashboardUnavailableError(parsed.data.error);
    }
    throw new Error(`Intake resume request failed with status ${res.status}`);
  }

  return patientIntakeResumeSchema.parse(await readJson(res));
}

export async function checkEmail(payload: CheckEmailPayload): Promise<CheckEmailResponse> {
  checkEmailPayloadSchema.parse(payload);
  const res = await fetch(`${getApiBaseUrl()}/portal/check-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Email check failed with status ${res.status}`));
  }

  const data = await readJson(res);
  return checkEmailResponseSchema.parse(data);
}
export type RegistrationStatusResult = { ok: true; status: RegistrationStatus } | { ok: false; code: string };

/**
 * Asks the backend whether this number can already sign in, before the flow
 * sends a verification code or creates anything. The browser decides nothing
 * here — it sends the number and renders the answer.
 *
 * A failure comes back as a code rather than a thrown message, so the caller
 * can tell "you already have an account" apart from an outage and does not
 * treat the second as the first.
 */
export async function getRegistrationStatus(phone: string): Promise<RegistrationStatusResult> {
  const payload = registrationStatusPayloadSchema.parse({ phone });

  const res = await fetch(`${getApiBaseUrl()}/intake/registration-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { ok: false, code: await readErrorCode(res) };
  }

  const data = registrationStatusResponseSchema.parse(await readJson(res));
  return { ok: true, status: data.status };
}

// Called right after OTP verification — returns whether this phone number
// already has a claimant (returning patient) or creates a new one.
export async function startIntake(payload: StartIntakePayload): Promise<StartIntakeResult> {
  const parsedPayload = startIntakePayloadSchema.parse(payload);
  // The accident is sent when the patient has answered those screens and not
  // before. Filling the gaps with an incident type, a location and today's
  // date would write a record that reads like an answer and is not one.
  const res = await fetch(`${getApiBaseUrl()}/intake/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authorizationHeader()) },
    body: JSON.stringify(parsedPayload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
      details?: string;
      missing?: string[];
    } | null;

    const missingFields = Array.isArray(body?.missing)
      ? body.missing.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    if (missingFields.length > 0) {
      throw new Error(`missing required fields: ${missingFields.join(", ")}`);
    }

    const message = [body?.message, body?.details, body?.error]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" - ");

    throw new Error(message || `Request failed with status ${res.status}`);
  }

  return res.json();
}

// Called after "My treatment location" for first-time claimants — fills in
// everything gathered since startIntake and marks the submission submitted.
export async function completeIntake(payload: CompleteIntakePayload): Promise<void> {
  const parsedPayload = completeIntakePayloadSchema.parse(payload);
  const res = await fetch(`${getApiBaseUrl()}/intake/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authorizationHeader()) },
    body: JSON.stringify(parsedPayload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Request failed with status ${res.status}`));
  }
}

export interface DocumentUploadUrlPayload {
  submissionId: string;
  fileName: string;
  category?: string;
}

// The evidence bucket is private and has no anonymous policy, so the browser
// cannot upload on its own — the backend issues a token for one object key.
export async function createDocumentUploadUrl(payload: DocumentUploadUrlPayload): Promise<DocumentUploadUrl> {
  const parsedPayload = documentUploadUrlPayloadSchema.parse(payload);
  const res = await fetch(`${getApiBaseUrl()}/intake/documents/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authorizationHeader()) },
    body: JSON.stringify(parsedPayload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Upload URL request failed with status ${res.status}`));
  }

  return documentUploadUrlResponseSchema.parse(await readJson(res));
}

export interface DeleteDocumentPayload {
  submissionId: string;
  storagePath: string;
}

export async function deleteDocument(payload: DeleteDocumentPayload): Promise<void> {
  const parsedPayload = deleteDocumentPayloadSchema.parse(payload);
  const res = await fetch(`${getApiBaseUrl()}/intake/documents/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authorizationHeader()) },
    body: JSON.stringify(parsedPayload),
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, `Delete request failed with status ${res.status}`));
  }
}

export interface RegisterPayload {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  registerPayloadSchema.parse(payload);
  const res = await fetch(`${getApiBaseUrl()}/portal/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = registerResponseSchema.parse(await readJson(res));

  if (!res.ok && !("error" in data)) {
    throw new Error(`Registration failed with status ${res.status}`);
  }

  return data;
}

// ── DocuSign agreement ───────────────────────────────────────────────────────
// The backend owns the envelope entirely: it decides whether one already
// exists, mints the single-use signing URL, and is the only authority on
// status. Nothing here reads a redirect parameter.

export type SigningEmbed = z.infer<typeof signingEmbedSchema>;

export type CreateAgreementResult =
  { ok: true; status: AgreementStatus; signingUrl?: string; embed?: SigningEmbed } | { ok: false; code: string };

export type AgreementStatusResult = { ok: true; status: AgreementStatus } | { ok: false; code: string };

/**
 * The access token from the session the Supabase browser client already holds.
 * There is no second token store: this reads whatever that client has, so a
 * signed-out or expired session simply yields nothing and the caller sends no
 * Authorization header rather than a stale one.
 */
async function authorizationHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function readErrorCode(response: Response): Promise<string> {
  const body = await response.json().catch(() => undefined);
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success ? parsed.data.error : `request_failed_${response.status}`;
}

/**
 * Creates the patient's agreement, or returns the one already in play. Errors
 * come back as codes rather than thrown messages so the caller can tell the
 * missing-email case apart from a genuine failure.
 */
export async function createAgreement(submissionId: string, locale: string): Promise<CreateAgreementResult> {
  // Parsed so the current language selection is validated before it leaves the
  // browser: the backend uses it to choose the EN/ES retainer, and an unsupported
  // value must never be sent rather than silently defaulted.
  const payload = agreementPayloadSchema.parse({ submissionId, locale });
  const res = await fetch(`${getApiBaseUrl()}/intake/agreement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authorizationHeader()) },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { ok: false, code: await readErrorCode(res) };
  }

  const data = createAgreementResponseSchema.parse(await readJson(res));
  return { ok: true, ...data };
}

/** The authoritative signing status, resolved server-side against DocuSign. */
export async function getAgreementStatus(submissionId: string): Promise<AgreementStatusResult> {
  const res = await fetch(`${getApiBaseUrl()}/intake/agreement/${encodeURIComponent(submissionId)}`, {
    headers: await authorizationHeader(),
  });

  if (!res.ok) {
    return { ok: false, code: await readErrorCode(res) };
  }

  const data = agreementStatusResponseSchema.parse(await readJson(res));
  return { ok: true, status: data.status };
}

// ── Development authentication bridge ────────────────────────────────────────

export type VerifyOtpResult = { ok: true; accessToken: string; refreshToken: string } | { ok: false; code: string };

/**
 * Asks the backend to verify the code. The browser sends the phone and the code
 * and nothing else — identity is the backend's to decide, so no user, claimant
 * or submission identifier is offered. A rejected code returns its reason as a
 * code rather than throwing, so the caller can tell an invalid entry apart from
 * an outage.
 */
export async function verifyOtp(phone: string, code: string): Promise<VerifyOtpResult> {
  const payload = verifyOtpPayloadSchema.parse({ phone, code });

  const res = await fetch(`${getApiBaseUrl()}/intake/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { ok: false, code: await readErrorCode(res) };
  }

  const session = verifyOtpResponseSchema.parse(await readJson(res));
  return { ok: true, accessToken: session.accessToken, refreshToken: session.refreshToken };
}
