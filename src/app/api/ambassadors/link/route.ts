import { createClient } from "@/lib/supabase/server";
import { looksLikeEmail } from "@/lib/ambassador-names";
import { NextResponse } from "next/server";
import { qrCodeForShortLink } from "@/lib/dub-qr";

const REFERRAL_API_BASE_URL = "https://api.dub.co";
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,29}$/;
const USERNAME_DISPLAY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._]{2,29}$/;
const DUB_KEY_MAX_LENGTH = 30;

type ClaimLinkRequest = {
  email?: string;
  phone?: string;
  locale?: string;
  username?: string;
  usernameDisplay?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  city?: string;
};

type PartnerResult = {
  id: string;
};

type LinkResult = {
  id: string;
  url?: string;
  shortLink?: string;
  qrCode?: string;
  key?: string;
  partnerId?: string;
};

type StorageErrorLike = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

type ProfileUpsertPayload = {
  user_id: string;
  email: string;
  phone?: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  organization: string | null;
  city: string | null;
};

function normalizeEmailOrNull(input: string | undefined): string | null {
  const trimmed = input?.trim().toLowerCase() ?? "";
  return trimmed ? trimmed : null;
}

function trimOrNull(input: string | undefined): string | null {
  const trimmed = input?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function extractPartner(result: unknown): PartnerResult | null {
  const top = asRecord(result);
  if (!top) return null;

  if (typeof top.id === "string") {
    return { id: top.id };
  }

  const nested = asRecord(top.partner);
  if (nested && typeof nested.id === "string") {
    return { id: nested.id };
  }

  return null;
}

function extractLink(result: unknown): LinkResult | null {
  const top = asRecord(result);
  if (!top) return null;

  if (typeof top.id === "string") {
    return {
      id: top.id,
      url: typeof top.url === "string" ? top.url : undefined,
      shortLink: typeof top.shortLink === "string" ? top.shortLink : undefined,
      qrCode: typeof top.qrCode === "string" ? top.qrCode : undefined,
      key: typeof top.key === "string" ? top.key : undefined,
      partnerId: typeof top.partnerId === "string" ? top.partnerId : undefined,
    };
  }

  const nested = asRecord(top.link);
  if (nested && typeof nested.id === "string") {
    return {
      id: nested.id,
      url: typeof nested.url === "string" ? nested.url : undefined,
      shortLink: typeof nested.shortLink === "string" ? nested.shortLink : undefined,
      qrCode: typeof nested.qrCode === "string" ? nested.qrCode : undefined,
      key: typeof nested.key === "string" ? nested.key : undefined,
      partnerId: typeof nested.partnerId === "string" ? nested.partnerId : undefined,
    };
  }

  return null;
}

// Same page, ignoring the query string and a trailing slash — Dub may append a
// partner group's UTM parameters, and stores a bare origin with a slash.
function isSameDestination(linkUrl: string | undefined, destinationUrl: string): boolean {
  if (!linkUrl) return false;
  try {
    const actual = new URL(linkUrl);
    const expected = new URL(destinationUrl);
    const path = (url: URL) => url.pathname.replace(/\/+$/, "");
    return actual.origin === expected.origin && path(actual) === path(expected);
  } catch {
    return false;
  }
}

function normalizeUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._]+/g, "");
}

function normalizeUsernameDisplay(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._]+/g, "");
}

function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

function normalizeDubKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function withDubKeySuffix(base: string, suffix: string): string {
  const safeSuffix = normalizeDubKey(suffix);
  const normalizedBase = normalizeDubKey(base) || "ambassador";
  if (!safeSuffix) return normalizedBase.slice(0, DUB_KEY_MAX_LENGTH);

  const separator = "-";
  const roomForBase = DUB_KEY_MAX_LENGTH - separator.length - safeSuffix.length;
  const trimmedBase = roomForBase > 0 ? normalizedBase.slice(0, roomForBase) : "";
  return trimmedBase ? `${trimmedBase}${separator}${safeSuffix}` : safeSuffix.slice(0, DUB_KEY_MAX_LENGTH);
}

function buildDubKeyCandidates(primaryKey: string, canonicalUsername: string, userId: string): string[] {
  const candidates = new Set<string>();
  const primary = normalizeDubKey(primaryKey).slice(0, DUB_KEY_MAX_LENGTH);
  const canonical = normalizeDubKey(canonicalUsername).slice(0, DUB_KEY_MAX_LENGTH);
  const id4 = userId.slice(0, 4).toLowerCase();
  const id8 = userId.slice(0, 8).toLowerCase();

  if (primary) candidates.add(primary);
  if (canonical) candidates.add(canonical);
  if (primary) candidates.add(withDubKeySuffix(primary, id4));
  if (primary) candidates.add(withDubKeySuffix(primary, id8));
  if (canonical) candidates.add(withDubKeySuffix(canonical, id4));
  if (canonical) candidates.add(withDubKeySuffix(canonical, id8));

  return [...candidates].filter(Boolean);
}

function deriveNameParts(value: string): {
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
} {
  const preferredName = value.trim();
  if (!preferredName || looksLikeEmail(preferredName)) {
    return { firstName: null, lastName: null, preferredName: null };
  }

  const nameParts = preferredName.split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) {
    return { firstName: null, lastName: null, preferredName: null };
  }

  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
  return { firstName, lastName, preferredName };
}

function formatPartnerName(firstName: string | null, lastName: string | null, preferredName: string | null): string {
  if (!firstName || !preferredName) return preferredName ?? "";
  const legalName = [firstName, lastName].filter(Boolean).join(" ");
  return `${legalName} (${preferredName})`;
}

async function upsertProfileWithPhoneFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: ProfileUpsertPayload
) {
  const { error: profileUpsertError } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });

  if (profileUpsertError?.code === "42703" && profileUpsertError.message.includes("phone")) {
    const { phone: _ignoredPhone, ...withoutPhone } = payload;
    return supabase.from("profiles").upsert(withoutPhone, { onConflict: "user_id" });
  }

  return { error: profileUpsertError };
}

async function upsertAmbassadorProfileWithDisplayFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Record<string, unknown>
) {
  const { error: ambassadorUpsertError } = await supabase
    .from("ambassador_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (ambassadorUpsertError?.code === "42703" && ambassadorUpsertError.message.includes("username_display")) {
    const { username_display: _ignoredUsernameDisplay, ...withoutUsernameDisplay } = payload;
    return supabase.from("ambassador_profiles").upsert(withoutUsernameDisplay, { onConflict: "user_id" });
  }

  return { error: ambassadorUpsertError };
}

function throwOnStorageError(context: string, error: StorageErrorLike | null): void {
  if (!error) return;
  console.error(`[ambassadors.link] ${context}`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
  if (
    error.code === "23514" &&
    typeof error.message === "string" &&
    (error.message.includes("ambassador_profiles_username_format_check") ||
      error.message.includes("ambassador_profiles_username_display_format_check"))
  ) {
    throw new Error("username_invalid");
  }
  throw new Error("profile_storage_unavailable");
}

async function referralProviderRequest(
  path: string,
  token: string,
  body: unknown,
  method: "POST" | "PUT" | "PATCH" = "POST"
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  let response: Response;
  try {
    response = await fetch(`${REFERRAL_API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("referral_provider_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  const parsed = safeJsonParse(text);

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error?: { message?: string } }).error?.message === "string"
        ? (parsed as { error: { message: string } }).error.message
        : `Referral provider error (${response.status})`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return parsed;
}

async function lookupReferralLinkByDomainAndKey(
  token: string,
  domain: string,
  key: string
): Promise<LinkResult | null> {
  const qs = new URLSearchParams();
  qs.set("domain", domain);
  qs.set("key", key);

  const response = await fetch(`${REFERRAL_API_BASE_URL}/links/info?${qs.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const text = await response.text();
  const parsed = safeJsonParse(text);
  return extractLink(parsed);
}

export async function POST(request: Request) {
  const token = process.env.DUB_API_KEY;
  if (!token) {
    return NextResponse.json({ error: "referral_service_unavailable" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as ClaimLinkRequest;
  const requestEmail = normalizeEmailOrNull(body.email);
  const phone = normalizePhone(body.phone ?? "");
  const locale = (body.locale?.trim() || "en").replace(/[^a-zA-Z-]/g, "");
  const requestFirstName = trimOrNull(body.firstName);
  const requestLastName = trimOrNull(body.lastName);
  const requestPreferredNameRaw = trimOrNull(body.preferredName);
  const requestPreferredName =
    requestPreferredNameRaw && !looksLikeEmail(requestPreferredNameRaw) ? requestPreferredNameRaw : null;
  const requestCity = trimOrNull(body.city);
  const normalizedUsername = normalizeUsername(body.username ?? "");
  const normalizedUsernameDisplay = normalizeUsernameDisplay(body.usernameDisplay ?? body.username ?? "");
  const referralLinkKey =
    normalizedUsernameDisplay && USERNAME_DISPLAY_PATTERN.test(normalizedUsernameDisplay)
      ? normalizedUsernameDisplay
      : normalizedUsername;
  const normalizedDisplayName = body.displayName?.trim() ?? "";

  if (!normalizedUsername) {
    return NextResponse.json({ error: "username_required" }, { status: 400 });
  }
  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    return NextResponse.json({ error: "username_invalid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userEmail = normalizeEmailOrNull(user.email);
  const userPhone = normalizePhone(user.phone ?? "");

  let profileEmail: string | null = null;
  let profileFirstName: string | null = null;
  let profileLastName: string | null = null;
  let profilePreferredName: string | null = null;
  let profileOrganization: string | null = null;
  let profileCity: string | null = null;
  const { data: existingProfileByUser, error: existingProfileByUserError } = await supabase
    .from("profiles")
    .select("email, first_name, last_name, preferred_name, organization, city")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingProfileByUserError) {
    profileEmail = normalizeEmailOrNull(existingProfileByUser?.email);
    profileFirstName =
      typeof existingProfileByUser?.first_name === "string" && !looksLikeEmail(existingProfileByUser.first_name)
        ? existingProfileByUser.first_name
        : null;
    profileLastName =
      typeof existingProfileByUser?.last_name === "string" && !looksLikeEmail(existingProfileByUser.last_name)
        ? existingProfileByUser.last_name
        : null;
    profilePreferredName =
      typeof existingProfileByUser?.preferred_name === "string" && !looksLikeEmail(existingProfileByUser.preferred_name)
        ? existingProfileByUser.preferred_name
        : null;
    profileOrganization =
      typeof existingProfileByUser?.organization === "string" ? trimOrNull(existingProfileByUser.organization) : null;
    profileCity = typeof existingProfileByUser?.city === "string" ? trimOrNull(existingProfileByUser.city) : null;
  }

  const partnerEmail = requestEmail ?? profileEmail ?? userEmail;
  if (!partnerEmail) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const { data: existingByUser, error: existingByUserError } = await supabase
    .from("ambassador_profiles")
    .select(
      "username, username_display, referral_link_key, short_link, qr_code_url, provider_link_id, provider_partner_id"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingByUserError) {
    return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
  }

  if (existingByUser?.short_link) {
    const existingShortLink = existingByUser.short_link;
    return NextResponse.json({
      linkId: existingByUser.provider_link_id ?? null,
      key:
        existingByUser.referral_link_key ??
        existingByUser.username_display ??
        existingByUser.username ??
        referralLinkKey,
      shortLink: existingShortLink,
      qrCode: qrCodeForShortLink(existingShortLink, existingByUser.qr_code_url),
    });
  }

  const { data: existingAmbassador, error: existingAmbassadorError } = await supabase
    .from("ambassador_profiles")
    .select("user_id")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (existingAmbassadorError) {
    return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
  }

  if (existingAmbassador && existingAmbassador.user_id !== user.id) {
    return NextResponse.json({ error: "username_unavailable", source: "local" }, { status: 409 });
  }

  const partnerName = formatPartnerName(
    requestFirstName ?? profileFirstName,
    requestLastName ?? profileLastName,
    requestPreferredName ?? profilePreferredName
  );
  const nameParts = deriveNameParts(partnerName);

  const requestOrigin = new URL(request.url).origin;
  const fallbackDestinationUrl = `${requestOrigin}/${locale}/intake`;
  const destinationUrl = process.env.DUB_AMBASSADOR_DESTINATION_URL ?? fallbackDestinationUrl;
  const preferredLinkDomain = process.env.DUB_AMBASSADOR_LINK_DOMAIN?.trim();

  try {
    const destinationHost = new URL(destinationUrl).hostname.toLowerCase();
    if (destinationHost === "localhost" || destinationHost === "127.0.0.1") {
      return NextResponse.json({ error: "referral_destination_domain_invalid" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "referral_destination_url_invalid" }, { status: 400 });
  }

  try {
    const { error: profileUpsertError } = await upsertProfileWithPhoneFallback(supabase, {
      user_id: user.id,
      email: partnerEmail,
      phone: phone || userPhone || null,
      first_name: requestFirstName ?? profileFirstName ?? nameParts.firstName,
      last_name: requestLastName ?? profileLastName ?? nameParts.lastName,
      preferred_name: requestPreferredName ?? profilePreferredName ?? nameParts.preferredName,
      organization: profileOrganization,
      city: requestCity ?? profileCity,
    });
    throwOnStorageError("profiles upsert failed", profileUpsertError);

    const { error: roleInsertError } = await supabase.from("user_roles").insert({
      user_id: user.id,
      role: "brand_ambassador",
    });
    if (roleInsertError && roleInsertError.code !== "23505") {
      throwOnStorageError("user_roles insert failed", roleInsertError);
    }

    const { error: ambassadorInProgressError } = await upsertAmbassadorProfileWithDisplayFallback(supabase, {
      user_id: user.id,
      username: normalizedUsername,
      username_display: normalizedUsernameDisplay || null,
      display_name: normalizedDisplayName || null,
      provisioning_status: "in_progress",
      provisioning_error_code: null,
    });
    throwOnStorageError("ambassador_profiles in-progress upsert failed", ambassadorInProgressError);

    let partnerId = existingByUser?.provider_partner_id ?? null;

    if (!partnerId) {
      const partnerResponse = await referralProviderRequest("/partners", token, {
        email: partnerEmail,
        name: partnerName,
        tenantId: user.id,
        username: referralLinkKey,
        description: "HAA ambassador",
      });
      const partner = extractPartner(partnerResponse);
      if (!partner) {
        throw new Error("referral_partner_not_created");
      }

      partnerId = partner.id;

      const { error: ambassadorPartnerUpsertError } = await upsertAmbassadorProfileWithDisplayFallback(supabase, {
        user_id: user.id,
        username: normalizedUsername,
        username_display: normalizedUsernameDisplay || null,
        display_name: normalizedDisplayName || null,
        provider_partner_id: partnerId,
        provisioning_status: "in_progress",
        provisioning_error_code: null,
      });
      throwOnStorageError("ambassador_profiles partner upsert failed", ambassadorPartnerUpsertError);
    }

    const keyCandidates = buildDubKeyCandidates(referralLinkKey, normalizedUsername, user.id);
    let link: LinkResult | null = null;
    let resolvedLinkKey = referralLinkKey;
    let lastLinkError: (Error & { status?: number }) | null = null;

    for (let index = 0; index < keyCandidates.length; index += 1) {
      const keyCandidate = keyCandidates[index];
      try {
        const linkResponse = await referralProviderRequest(
          "/partners/links/upsert",
          token,
          {
            partnerId,
            ...(preferredLinkDomain ? { domain: preferredLinkDomain } : {}),
            key: keyCandidate,
            url: destinationUrl,
            linkProps: {
              comments: "HAA ambassador referral link",
            },
          },
          "PUT"
        );

        link = extractLink(linkResponse);
        if (link) {
          resolvedLinkKey = link.key ?? keyCandidate;
          break;
        }

        throw new Error("referral_link_not_created");
      } catch (error) {
        const conflict = error as Error & { status?: number };
        if (conflict.status === 409) {
          if (index === 0 && preferredLinkDomain) {
            const existingPrimaryLink = await lookupReferralLinkByDomainAndKey(
              token,
              preferredLinkDomain,
              keyCandidate
            );
            if (existingPrimaryLink && existingPrimaryLink.partnerId === partnerId) {
              link = existingPrimaryLink;
              resolvedLinkKey = existingPrimaryLink.key ?? keyCandidate;
              break;
            }
          }
          lastLinkError = conflict;
          continue;
        }
        throw error;
      }
    }

    if (!link && lastLinkError) {
      throw lastLinkError;
    }

    if (!link) {
      throw new Error("referral_link_not_created");
    }

    // Enrolling a partner makes Dub create the partner group's default link, keyed on
    // the username — so the upsert above conflicts on that key and adopts it, and its
    // destination is the group's, not this environment's. Point it here before handing
    // it out: a link that sends referrals to another site is not a provisioned link.
    if (!isSameDestination(link.url, destinationUrl)) {
      const linkId = link.id;
      const repointed = await referralProviderRequest(
        `/links/${encodeURIComponent(linkId)}`,
        token,
        { url: destinationUrl },
        "PATCH"
      ).then(extractLink, (error: Error & { status?: number }) => {
        console.error("[ambassadors.link] referral link repoint failed", { linkId, status: error.status ?? null });
        return null;
      });
      if (!repointed || !isSameDestination(repointed.url, destinationUrl)) {
        throw new Error("referral_link_destination_mismatch");
      }
      link = { ...link, url: repointed.url };
    }

    const resolvedQrCode = qrCodeForShortLink(link.shortLink, link.qrCode);

    const { error: ambassadorSuccessUpsertError } = await upsertAmbassadorProfileWithDisplayFallback(supabase, {
      user_id: user.id,
      username: normalizedUsername,
      username_display: normalizedUsernameDisplay || null,
      display_name: normalizedDisplayName || null,
      referral_link_key: resolvedLinkKey,
      short_link: link.shortLink ?? null,
      qr_code_url: resolvedQrCode,
      provider_partner_id: partnerId,
      provider_link_id: link.id,
      provisioning_status: "success",
      provisioning_error_code: null,
      provisioned_at: new Date().toISOString(),
    });
    throwOnStorageError("ambassador_profiles success upsert failed", ambassadorSuccessUpsertError);

    return NextResponse.json({
      linkId: link.id,
      key: resolvedLinkKey,
      shortLink: link.shortLink ?? null,
      qrCode: resolvedQrCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "referral_link_claim_failed";
    const lowered = message.toLowerCase();

    const { data: existingProfileAnyError, error: existingProfileAnyErrorLookup } = await supabase
      .from("ambassador_profiles")
      .select("referral_link_key, short_link, qr_code_url, provider_link_id, username, username_display")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingProfileAnyErrorLookup && existingProfileAnyError?.short_link) {
      return NextResponse.json({
        linkId: existingProfileAnyError.provider_link_id ?? null,
        key:
          existingProfileAnyError.referral_link_key ??
          existingProfileAnyError.username_display ??
          existingProfileAnyError.username ??
          referralLinkKey,
        shortLink: existingProfileAnyError.short_link,
        qrCode: qrCodeForShortLink(existingProfileAnyError.short_link, existingProfileAnyError.qr_code_url),
      });
    }

    const errorWithStatus = error as Error & { status?: number };
    const isDuplicateError =
      errorWithStatus.status === 409 ||
      lowered.includes("already") ||
      lowered.includes("taken") ||
      lowered.includes("exists") ||
      lowered.includes("duplicate");

    if (isDuplicateError) {
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("ambassador_profiles")
        .select("referral_link_key, short_link, qr_code_url, provider_link_id, username, username_display")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existingProfileError && existingProfile?.short_link) {
        return NextResponse.json({
          linkId: existingProfile.provider_link_id ?? null,
          key:
            existingProfile.referral_link_key ??
            existingProfile.username_display ??
            existingProfile.username ??
            referralLinkKey,
          shortLink: existingProfile.short_link,
          qrCode: qrCodeForShortLink(existingProfile.short_link, existingProfile.qr_code_url),
        });
      }
    }

    const { error: ambassadorFailedUpsertError } = await upsertAmbassadorProfileWithDisplayFallback(supabase, {
      user_id: user.id,
      username: normalizedUsername,
      username_display: normalizedUsernameDisplay || null,
      display_name: normalizedDisplayName || null,
      provisioning_status: "failed",
      provisioning_error_code: "referral_link_unavailable",
    });
    if (ambassadorFailedUpsertError) {
      console.error("[ambassadors.link] ambassador_profiles failed-state upsert failed", {
        message: ambassadorFailedUpsertError.message,
        details: ambassadorFailedUpsertError.details,
        hint: ambassadorFailedUpsertError.hint,
        code: ambassadorFailedUpsertError.code,
      });
    }

    if (isDuplicateError) {
      return NextResponse.json(
        {
          error: "username_unavailable",
          source: errorWithStatus.status === 409 ? "dub" : "unknown",
        },
        { status: 409 }
      );
    }

    if (lowered.includes("invalid") && lowered.includes("username")) {
      return NextResponse.json({ error: "username_invalid" }, { status: 400 });
    }

    return NextResponse.json({ error: "referral_link_unavailable" }, { status: 502 });
  }
}
