import { getApiBaseUrl } from "@/lib/backend-api";
import { debugAllowedHere } from "@/lib/debug";
import { isDebugEnabled } from "@/lib/debug";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type StatusKey =
  | "statusIntake"
  | "statusSubmitted"
  | "statusAwaitingSignature"
  | "statusAttorney"
  | "statusDoctor"
  | "statusQualified"
  | "statusSigned"
  | "statusTreating"
  | "statusNotQualified";

type PersonRecord = {
  id: string;
  name: string;
  incident: string;
  date: string;
  phone: string;
  email: string;
  location: string;
  statusKey: StatusKey;
  leadCreatedAt: string;
};

/** What GET /ambassadors/people answers with. */
type ReferredPerson = {
  submissionId?: unknown;
  name?: unknown;
  incidentType?: unknown;
  incidentDate?: unknown;
  location?: unknown;
  phone?: unknown;
  email?: unknown;
  status?: unknown;
  referredAt?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Every intake_submissions.status the backend can send, by exact value. The
// status is the backend's record of where the case stands, so it is read, never
// guessed at: 'retainer_pending_signature' is a retainer sent and not signed,
// and only 'signed' — which the backend sets once DocuSign reports the envelope
// completed — is Signed. A substring test once read the first as the second.
const STATUS_KEYS = new Map<string, StatusKey>([
  ["in_progress", "statusIntake"],
  ["intake", "statusIntake"],
  ["submitted", "statusSubmitted"],
  ["retainer_pending_signature", "statusAwaitingSignature"],
  ["signed", "statusSigned"],
  ["attorney", "statusAttorney"],
  ["doctor", "statusDoctor"],
  ["treating", "statusTreating"],
  ["qualified", "statusQualified"],
  ["not_qualified", "statusNotQualified"],
]);

// A status this app does not know yet reads as the start of the flow, as before.
function toStatusKey(value: string): StatusKey {
  return STATUS_KEYS.get(value.trim().toLowerCase()) ?? "statusIntake";
}

function toPersonRecord(person: ReferredPerson): PersonRecord | null {
  const id = asString(person.submissionId);
  if (!id) return null;

  return {
    id,
    name: asString(person.name) || "Unknown",
    incident: titleize(asString(person.incidentType)),
    date: asString(person.incidentDate),
    phone: asString(person.phone),
    email: asString(person.email),
    location: asString(person.location),
    statusKey: toStatusKey(asString(person.status)),
    leadCreatedAt: asString(person.referredAt),
  };
}

/**
 * People Helped, as the backend scoped it.
 *
 * This route holds no patient-data logic and reaches no database. Which
 * patients belong to which ambassador is an authorization question, and it is
 * answered by GET /ambassadors/people, which resolves the caller's referral
 * link from their own row and reads only the intakes recorded against it.
 *
 * The frontend previously answered that question itself, with the service-role
 * key, against claimants and accidents directly — a second patient-data path
 * outside the backend, and against the rule in CLAUDE.md that the frontend
 * never queries Supabase for business data. Everything here now happens over
 * the caller's own session token.
 *
 * Anything other than a 200 is an empty list. There is no source of patient
 * records in this file other than that one response, so there is nothing for a
 * fallback to fall back to.
 */
export async function GET(request: Request) {
  const debug = isDebugEnabled(request);
  const diagnosticsEnabled = debugAllowedHere();
  const supabase = await createClient();
  const requestUrl = new URL(request.url);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return NextResponse.json(
      {
        people: [],
        ...(debug ? { debug: { reason: "no_session" } } : {}),
        ...(diagnosticsEnabled
          ? {
              diagnostics: {
                source: "backend:/ambassadors/people",
                backendConfiguredUrl: getApiBaseUrl(),
                backendHealth: "no_session",
              },
            }
          : {}),
      },
      { status: 200 }
    );
  }

  try {
    const backendUrl = new URL(`${getApiBaseUrl()}/ambassadors/people`);
    requestUrl.searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value);
    });

    const response = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[ambassadors.people] backend refused", { status: response.status });
      return NextResponse.json(
        {
          people: [],
          ...(debug ? { debug: { reason: "backend_error", status: response.status } } : {}),
          ...(diagnosticsEnabled
            ? {
                diagnostics: {
                  source: "backend:/ambassadors/people",
                  backendConfiguredUrl: getApiBaseUrl(),
                  backendHealth: "error",
                  backendStatus: response.status,
                },
              }
            : {}),
        },
        { status: 200 }
      );
    }

    const payload = (await response.json().catch(() => null)) as {
      people?: unknown;
      truncated?: unknown;
      debug?: unknown;
    } | null;

    const people = (Array.isArray(payload?.people) ? payload.people : [])
      .map((person) => toPersonRecord(person as ReferredPerson))
      .filter((person): person is PersonRecord => person !== null);

    return NextResponse.json(
      {
        people,
        truncated: payload?.truncated === true,
        ...(debug
          ? {
              debug: {
                reason: "ok",
                peopleCount: people.length,
                backend: payload?.debug ?? null,
              },
            }
          : {}),
        ...(diagnosticsEnabled
          ? {
              diagnostics: {
                source: "backend:/ambassadors/people",
                backendConfiguredUrl: getApiBaseUrl(),
                backendHealth: "ok",
              },
            }
          : {}),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[ambassadors.people] backend unreachable", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        people: [],
        ...(debug ? { debug: { reason: "backend_unreachable" } } : {}),
        ...(diagnosticsEnabled
          ? {
              diagnostics: {
                source: "backend:/ambassadors/people",
                backendConfiguredUrl: getApiBaseUrl(),
                backendHealth: "unreachable",
              },
            }
          : {}),
      },
      { status: 200 }
    );
  }
}
