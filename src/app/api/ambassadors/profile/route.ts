import { createClient } from "@/lib/supabase/server";
import { AMBASSADOR_ROLE_KEYS, type AmbassadorRoleKey } from "@/lib/constants";
import { looksLikeEmail } from "@/lib/ambassador-names";
import { NextResponse } from "next/server";
import { qrCodeForShortLink } from "@/lib/dub-qr";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,29}$/;
const AVATAR_BUCKET = "profile-avatars";
const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_AVATAR_BYTES = 2_000_000;

type SaveAmbassadorProfileRequest = {
  draftOnly?: boolean;
  displayName?: string;
  username?: string;
  usernameDisplay?: string;
  email?: string;
  avatarDataUrl?: string;
  personalMessage?: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  organization?: string;
  city?: string;
  roleKey?: string;
};

function normalizeCanonicalUsername(input: string): string {
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

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmailOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAvatarDataUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > 2_800_000) return null;
  return trimmed;
}

function normalizePersonalMessage(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 4000);
}

function extensionFromMime(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return null;
}

function parseAvatarDataUrl(input: string | null): { bytes: Uint8Array; contentType: string; ext: string } | null {
  if (!input || !input.startsWith("data:image/")) return null;

  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(input);
  if (!match) return null;

  const contentType = (match[1] ?? "").toLowerCase();
  if (!ALLOWED_AVATAR_MIME.has(contentType)) return null;

  const ext = extensionFromMime(contentType);
  if (!ext) return null;

  const base64Payload = match[2] ?? "";
  const raw = Buffer.from(base64Payload, "base64");
  if (!raw.length || raw.length > MAX_AVATAR_BYTES) return null;

  return { bytes: new Uint8Array(raw), contentType, ext };
}

async function uploadAvatarToStorage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  parsed: { bytes: Uint8Array; contentType: string; ext: string }
): Promise<string> {
  const storagePath = `ambassadors/${userId}/avatar.${parsed.ext}`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(storagePath, parsed.bytes, {
    contentType: parsed.contentType,
    upsert: true,
    cacheControl: "3600",
  });

  if (error) {
    throw new Error("avatar_upload_failed");
  }

  return storagePath;
}

async function resolveAvatarUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storedPath: string | null | undefined
): Promise<string | null> {
  const value = storedPath?.trim() ?? "";
  if (!value) return null;

  // Backward compatibility for previously persisted data URLs.
  if (value.startsWith("data:image/")) {
    return normalizeAvatarDataUrl(value);
  }

  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(value, 60 * 60);
  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

function deriveNameParts(value: string | null): {
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
} {
  const preferredName = value?.trim() ?? "";
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

async function upsertProfileWithPhoneFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Record<string, unknown>
) {
  const { error: profileUpsertError } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });

  if (profileUpsertError?.code !== "42703") {
    return { error: profileUpsertError };
  }

  const fallbackPayload: Record<string, unknown> = { ...payload };
  let shouldRetry = false;

  if (profileUpsertError.message.includes("phone")) {
    delete fallbackPayload.phone;
    shouldRetry = true;
  }

  if (profileUpsertError.message.includes("avatar_path")) {
    delete fallbackPayload.avatar_path;
    shouldRetry = true;
  }

  if (!shouldRetry) {
    return { error: profileUpsertError };
  }

  return supabase.from("profiles").upsert(fallbackPayload, { onConflict: "user_id" });
}

async function upsertAmbassadorProfileWithDisplayFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Record<string, unknown>
) {
  const { error: ambassadorUpsertError } = await supabase
    .from("ambassador_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (ambassadorUpsertError?.code === "42703") {
    const fallbackPayload = { ...payload };
    let shouldRetry = false;

    if (ambassadorUpsertError.message.includes("username_display") && "username_display" in fallbackPayload) {
      delete fallbackPayload.username_display;
      shouldRetry = true;
    }

    if (ambassadorUpsertError.message.includes("personal_message") && "personal_message" in fallbackPayload) {
      delete fallbackPayload.personal_message;
      shouldRetry = true;
    }

    if (shouldRetry) {
      return supabase.from("ambassador_profiles").upsert(fallbackPayload, { onConflict: "user_id" });
    }
  }

  return { error: ambassadorUpsertError };
}

function isAmbassadorRoleKey(value: string): value is AmbassadorRoleKey {
  return (AMBASSADOR_ROLE_KEYS as readonly string[]).includes(value);
}

function normalizeRoleKeyInput(value: string | null): string | null {
  if (value === "citizen") return "everydayHero";
  return value;
}

function roleKeyForStorage(value: string | null): string | null {
  if (value === "everydayHero") return "citizen";
  return value;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let personalMessage: string | undefined;
  let shortLink: string | null = null;
  let qrCode: string | null = null;
  let usernameDisplay: string | null = null;
  let displayName: string | null = null;
  let username: string | null = null;
  let roleKey: string | null = null;
  const { data: ambassadorData, error: ambassadorError } = await supabase
    .from("ambassador_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    ambassadorError &&
    !(
      ambassadorError.code === "42703" &&
      (ambassadorError.message.includes("personal_message") ||
        ambassadorError.message.includes("short_link") ||
        ambassadorError.message.includes("qr_code_url") ||
        ambassadorError.message.includes("username_display") ||
        ambassadorError.message.includes("display_name") ||
        ambassadorError.message.includes("username") ||
        ambassadorError.message.includes("role_key"))
    )
  ) {
    return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
  }

  if (!ambassadorError) {
    const ambassadorRecord = ambassadorData as Record<string, unknown> | null;
    const dbPersonalMessage = ambassadorRecord?.personal_message;
    personalMessage = typeof dbPersonalMessage === "string" ? normalizePersonalMessage(dbPersonalMessage) : undefined;
    shortLink = typeof ambassadorRecord?.short_link === "string" ? ambassadorRecord.short_link : null;
    qrCode = qrCodeForShortLink(
      shortLink,
      typeof ambassadorRecord?.qr_code_url === "string" ? ambassadorRecord.qr_code_url : null
    );
    usernameDisplay = typeof ambassadorRecord?.username_display === "string" ? ambassadorRecord.username_display : null;
    displayName = typeof ambassadorRecord?.display_name === "string" ? ambassadorRecord.display_name : null;
    username = typeof ambassadorRecord?.username === "string" ? ambassadorRecord.username : null;
    roleKey = typeof ambassadorRecord?.role_key === "string" ? ambassadorRecord.role_key : null;
  }

  if (!personalMessage) {
    const metadataPersonalMessage = user.user_metadata?.onboardingAmbassadorShareMessage;
    personalMessage =
      typeof metadataPersonalMessage === "string" ? normalizePersonalMessage(metadataPersonalMessage) : undefined;
  }

  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();

  if (error) {
    if (error.code === "42703" && error.message.includes("avatar_path")) {
      return NextResponse.json(
        {
          avatarDataUrl: null,
          personalMessage,
          shortLink,
          qrCode,
          usernameDisplay,
          displayName,
          username,
          roleKey,
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
  }

  const profileRecord = (data as Record<string, unknown> | null) ?? null;
  const avatarPath = typeof profileRecord?.avatar_path === "string" ? profileRecord.avatar_path : null;
  const avatarDataUrl = await resolveAvatarUrl(supabase, avatarPath);

  return NextResponse.json(
    {
      avatarDataUrl,
      personalMessage,
      shortLink,
      qrCode,
      usernameDisplay,
      displayName,
      username,
      roleKey,
      firstName: typeof profileRecord?.first_name === "string" ? profileRecord.first_name : null,
      lastName: typeof profileRecord?.last_name === "string" ? profileRecord.last_name : null,
      preferredName: typeof profileRecord?.preferred_name === "string" ? profileRecord.preferred_name : null,
      organization: typeof profileRecord?.organization === "string" ? profileRecord.organization : null,
      city: typeof profileRecord?.city === "string" ? profileRecord.city : null,
      email: typeof profileRecord?.email === "string" ? profileRecord.email : null,
      phone: typeof profileRecord?.phone === "string" ? profileRecord.phone : null,
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SaveAmbassadorProfileRequest;
  const draftOnly = body.draftOnly === true;
  const displayName = trimOrNull(body.displayName);
  const usernameDisplayRaw = body.usernameDisplay ?? body.username ?? "";
  const usernameDisplay = normalizeUsernameDisplay(usernameDisplayRaw);
  const username = normalizeCanonicalUsername(usernameDisplayRaw);
  const firstName = trimOrNull(body.firstName);
  const lastName = trimOrNull(body.lastName);
  const preferredNameRaw = trimOrNull(body.preferredName);
  const preferredName = preferredNameRaw && !looksLikeEmail(preferredNameRaw) ? preferredNameRaw : null;
  const organization = trimOrNull(body.organization);
  const city = trimOrNull(body.city);
  const roleKey = normalizeRoleKeyInput(trimOrNull(body.roleKey));
  const requestEmail = normalizeEmailOrNull(body.email);
  const avatarDataUrl = normalizeAvatarDataUrl(body.avatarDataUrl);
  const personalMessage = normalizePersonalMessage(body.personalMessage);

  if (!draftOnly && !displayName) {
    return NextResponse.json({ error: "display_name_required" }, { status: 400 });
  }
  if (!draftOnly && !username) {
    return NextResponse.json({ error: "username_required" }, { status: 400 });
  }
  if (username && !USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "username_invalid" }, { status: 400 });
  }
  if (roleKey && !isAmbassadorRoleKey(roleKey)) {
    return NextResponse.json({ error: "role_invalid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let email: string | undefined = requestEmail ?? undefined;
  let existingAvatarPath: string | null = null;
  let existingFirstName: string | null = null;
  let existingLastName: string | null = null;
  let existingPreferredName: string | null = null;
  let existingOrganization: string | null = null;
  let existingCity: string | null = null;

  let existingProfileEmail: string | undefined;
  {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("email, avatar_path, first_name, last_name, preferred_name, organization, city")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingProfileError?.code === "42703" && existingProfileError.message.includes("avatar_path")) {
      const { data: fallbackProfile } = await supabase
        .from("profiles")
        .select("email, first_name, last_name, preferred_name, organization, city")
        .eq("user_id", user.id)
        .maybeSingle();
      existingProfileEmail = normalizeEmailOrNull(fallbackProfile?.email) ?? undefined;
      existingAvatarPath = null;
      existingFirstName = trimOrNull(fallbackProfile?.first_name);
      existingLastName = trimOrNull(fallbackProfile?.last_name);
      existingPreferredName = trimOrNull(fallbackProfile?.preferred_name);
      existingOrganization = trimOrNull(fallbackProfile?.organization);
      existingCity = trimOrNull(fallbackProfile?.city);
    } else if (!existingProfileError) {
      existingProfileEmail = normalizeEmailOrNull(existingProfile?.email) ?? undefined;
      existingAvatarPath = (existingProfile?.avatar_path as string | null | undefined) ?? null;
      existingFirstName = trimOrNull(existingProfile?.first_name);
      existingLastName = trimOrNull(existingProfile?.last_name);
      existingPreferredName = trimOrNull(existingProfile?.preferred_name);
      existingOrganization = trimOrNull(existingProfile?.organization);
      existingCity = trimOrNull(existingProfile?.city);
    }
  }

  if (!email) {
    email = existingProfileEmail;
  }

  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const resolvedEmail = email;

  const metadataPreferredNameRaw =
    (typeof user.user_metadata?.preferredName === "string" && user.user_metadata.preferredName.trim()) ||
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    null;
  const metadataPreferredName =
    metadataPreferredNameRaw && !looksLikeEmail(metadataPreferredNameRaw) ? metadataPreferredNameRaw : null;
  const safeDisplayName = displayName && !looksLikeEmail(displayName) ? displayName : null;
  const resolvedPreferredName = preferredName ?? existingPreferredName ?? safeDisplayName ?? metadataPreferredName;
  const derivedNames = deriveNameParts(resolvedPreferredName);
  const resolvedFirstName = firstName ?? existingFirstName ?? derivedNames.firstName;
  const resolvedLastName = lastName ?? existingLastName ?? derivedNames.lastName;
  const resolvedPreferredNameForProfile = resolvedPreferredName ?? derivedNames.preferredName;
  const resolvedOrganization = organization ?? existingOrganization;
  const resolvedCity = city ?? existingCity;
  const normalizedPhone = normalizePhone(user.phone ?? "");

  let avatarPathToPersist = existingAvatarPath;
  const parsedAvatar = parseAvatarDataUrl(avatarDataUrl);
  if (parsedAvatar) {
    try {
      avatarPathToPersist = await uploadAvatarToStorage(supabase, user.id, parsedAvatar);
    } catch {
      return NextResponse.json({ error: "avatar_upload_unavailable" }, { status: 502 });
    }
  }

  if (username) {
    const { data: existingByUsername, error: existingByUsernameError } = await supabase
      .from("ambassador_profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();

    if (existingByUsernameError) {
      console.error("[ambassadors.profile] username lookup failed", {
        message: existingByUsernameError.message,
        details: existingByUsernameError.details,
        hint: existingByUsernameError.hint,
        code: existingByUsernameError.code,
      });
      return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
    }

    if (existingByUsername && existingByUsername.user_id !== user.id) {
      return NextResponse.json({ error: "username_unavailable" }, { status: 409 });
    }
  }

  const profilePayload = {
    user_id: user.id,
    email: resolvedEmail,
    phone: normalizedPhone,
    first_name: resolvedFirstName,
    last_name: resolvedLastName,
    preferred_name: resolvedPreferredNameForProfile,
    organization: resolvedOrganization,
    city: resolvedCity,
    avatar_path: avatarPathToPersist,
  };

  const { error: profileUpsertError } = await upsertProfileWithPhoneFallback(supabase, profilePayload);

  if (profileUpsertError) {
    console.error("[ambassadors.profile] profiles upsert failed", {
      message: profileUpsertError.message,
      details: profileUpsertError.details,
      hint: profileUpsertError.hint,
      code: profileUpsertError.code,
    });
    return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
  }

  const { error: roleInsertError } = await supabase.from("user_roles").insert({
    user_id: user.id,
    role: "brand_ambassador",
  });

  if (roleInsertError && roleInsertError.code !== "23505") {
    console.error("[ambassadors.profile] user_roles insert failed", {
      message: roleInsertError.message,
      details: roleInsertError.details,
      hint: roleInsertError.hint,
      code: roleInsertError.code,
    });
    return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
  }

  const ambassadorUpsertPayload: {
    user_id: string;
    role_key: string | null;
    personal_message: string | null;
    display_name?: string;
    username?: string;
    username_display?: string;
    onboarding_status: "signup_completed" | "profile_completed";
    provisioning_status: "pending";
  } = {
    user_id: user.id,
    role_key: roleKeyForStorage(roleKey),
    personal_message: personalMessage ?? null,
    onboarding_status: draftOnly ? "signup_completed" : "profile_completed",
    provisioning_status: "pending",
  };

  if (displayName) {
    ambassadorUpsertPayload.display_name = displayName;
  }
  if (username) {
    ambassadorUpsertPayload.username = username;
    ambassadorUpsertPayload.username_display = usernameDisplay || undefined;
  }

  const { error: ambassadorUpsertError } = await upsertAmbassadorProfileWithDisplayFallback(
    supabase,
    ambassadorUpsertPayload
  );

  if (ambassadorUpsertError) {
    const message = ambassadorUpsertError.message.toLowerCase();
    if (message.includes("duplicate") || message.includes("unique")) {
      return NextResponse.json({ error: "username_unavailable" }, { status: 409 });
    }
    if (
      ambassadorUpsertError.code === "23514" &&
      (message.includes("ambassador_profiles_username_format_check") ||
        message.includes("ambassador_profiles_username_display_format_check"))
    ) {
      return NextResponse.json({ error: "username_invalid" }, { status: 400 });
    }
    console.error("[ambassadors.profile] ambassador_profiles upsert failed", {
      message: ambassadorUpsertError.message,
      details: ambassadorUpsertError.details,
      hint: ambassadorUpsertError.hint,
      code: ambassadorUpsertError.code,
    });
    return NextResponse.json({ error: "profile_storage_unavailable" }, { status: 503 });
  }

  // Keep a durable fallback in auth metadata for environments without personal_message column.
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      onboardingAmbassadorShareMessage: personalMessage ?? undefined,
    },
  });

  if (metadataError) {
    console.error("[ambassadors.profile] auth metadata update failed", {
      message: metadataError.message,
      code: metadataError.code,
    });
  }

  return NextResponse.json({ ok: true, username }, { status: 200 });
}
