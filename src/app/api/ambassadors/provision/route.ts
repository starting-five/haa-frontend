import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { qrCodeForShortLink } from "@/lib/dub-qr";

const REFERRAL_API_BASE_URL = "https://api.dub.co";

type ProvisionRequest = {
  email?: string;
  locale?: string;
};

type PartnerResult = {
  id: string;
  tenantId?: string;
};

type LinkResult = {
  id: string;
  shortLink?: string;
  qrCode?: string;
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function slugFromEmailAndUser(email: string, userId: string): string {
  const localPart = email.split("@")[0] ?? "ambassador";
  const base = localPart
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return `ba-${base || "user"}-${userId.slice(0, 6).toLowerCase()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function extractPartner(result: unknown): PartnerResult | null {
  const top = asRecord(result);
  if (!top) return null;

  const fromTopId = typeof top.id === "string" ? top.id : null;
  const fromTopTenantId = typeof top.tenantId === "string" ? top.tenantId : undefined;
  if (fromTopId) {
    return { id: fromTopId, tenantId: fromTopTenantId };
  }

  const nested = asRecord(top.partner);
  const nestedId = nested && typeof nested.id === "string" ? nested.id : null;
  const nestedTenantId = nested && typeof nested.tenantId === "string" ? nested.tenantId : undefined;
  if (nestedId) {
    return { id: nestedId, tenantId: nestedTenantId };
  }

  return null;
}

function extractLink(result: unknown): LinkResult | null {
  const top = asRecord(result);
  if (!top) return null;

  const fromTopId = typeof top.id === "string" ? top.id : null;
  const fromTopShortLink = typeof top.shortLink === "string" ? top.shortLink : undefined;
  const fromTopQr = typeof top.qrCode === "string" ? top.qrCode : undefined;
  if (fromTopId) {
    return { id: fromTopId, shortLink: fromTopShortLink, qrCode: fromTopQr };
  }

  const nested = asRecord(top.link);
  const nestedId = nested && typeof nested.id === "string" ? nested.id : null;
  const nestedShortLink = nested && typeof nested.shortLink === "string" ? nested.shortLink : undefined;
  const nestedQr = nested && typeof nested.qrCode === "string" ? nested.qrCode : undefined;
  if (nestedId) {
    return { id: nestedId, shortLink: nestedShortLink, qrCode: nestedQr };
  }

  return null;
}

async function referralProviderRequest(path: string, token: string, body: unknown, method: "POST" | "PUT" = "POST") {
  const response = await fetch(`${REFERRAL_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

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
    throw new Error(message);
  }

  return parsed;
}

export async function POST(request: Request) {
  console.log("[ambassador.provision] request:start");

  const token = process.env.DUB_API_KEY;
  if (!token) {
    console.log("[ambassador.provision] config:error referral api key missing");
    return NextResponse.json({ error: "referral_service_unavailable" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as ProvisionRequest;
  const email = body.email?.trim().toLowerCase();
  const locale = (body.locale?.trim() || "en").replace(/[^a-zA-Z-]/g, "");

  if (!email) {
    console.log("[ambassador.provision] request:error missing_email");
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.log("[ambassador.provision] auth:error unauthorized", { hasUserError: Boolean(userError) });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userEmail = user.email?.toLowerCase();
  if (!userEmail || userEmail !== email) {
    console.log("[ambassador.provision] auth:error email_mismatch", {
      requestEmail: email,
      userEmail: userEmail ?? null,
      userId: user.id,
    });
    return NextResponse.json({ error: "email_mismatch" }, { status: 403 });
  }

  const partnerName =
    (typeof user.user_metadata?.preferredName === "string" && user.user_metadata.preferredName.trim()) ||
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    userEmail;

  const requestOrigin = new URL(request.url).origin;
  const fallbackDestinationUrl = `${requestOrigin}/${locale}/intake`;
  const destinationUrl = process.env.DUB_AMBASSADOR_DESTINATION_URL ?? fallbackDestinationUrl;
  const preferredLinkDomain = process.env.DUB_AMBASSADOR_LINK_DOMAIN?.trim();
  console.log("[ambassador.provision] destination:selected", {
    destinationUrl,
    usingEnvOverride: Boolean(process.env.DUB_AMBASSADOR_DESTINATION_URL),
    requestOrigin,
    preferredLinkDomain: preferredLinkDomain || null,
  });

  // Referral partner programs often restrict destination domains. Never send localhost.
  try {
    const destinationHost = new URL(destinationUrl).hostname.toLowerCase();
    if (destinationHost === "localhost" || destinationHost === "127.0.0.1") {
      console.log("[ambassador.provision] config:error invalid destination host", { destinationHost });
      return NextResponse.json(
        {
          error: "referral_destination_domain_invalid",
          message: "Referral destination URL must use an approved public domain.",
        },
        { status: 400 }
      );
    }
  } catch {
    console.log("[ambassador.provision] config:error invalid destination url", { destinationUrl });
    return NextResponse.json(
      {
        error: "referral_destination_url_invalid",
        message: "Referral destination URL must be a valid absolute URL.",
      },
      { status: 400 }
    );
  }
  const key = slugFromEmailAndUser(userEmail, user.id);

  try {
    console.log("[ambassador.provision] referral:createPartner:start", {
      userId: user.id,
      email: userEmail,
      key,
    });
    const partnerResponse = await referralProviderRequest("/partners", token, {
      email: userEmail,
      name: partnerName,
      tenantId: user.id,
      username: key,
      description: "HAA ambassador",
    });

    const partner = extractPartner(partnerResponse);
    console.log("[ambassador.provision] referral:createPartner:response", {
      hasPartner: Boolean(partner),
      partnerId: partner?.id ?? null,
      responseKeys: asRecord(partnerResponse)
        ? Object.keys(asRecord(partnerResponse) as Record<string, unknown>)
        : null,
    });
    if (!partner) {
      throw new Error("referral_partner_not_created");
    }

    console.log("[ambassador.provision] referral:upsertLink:start", {
      partnerId: partner.id,
      destinationUrl,
      key,
    });
    const partnerLinkResponse = await referralProviderRequest(
      "/partners/links/upsert",
      token,
      {
        partnerId: partner.id,
        ...(preferredLinkDomain ? { domain: preferredLinkDomain } : {}),
        url: destinationUrl,
        key,
        linkProps: {
          comments: "HAA ambassador referral link",
        },
      },
      "PUT"
    );

    const partnerLink = extractLink(partnerLinkResponse);
    console.log("[ambassador.provision] referral:upsertLink:response", {
      hasLink: Boolean(partnerLink),
      linkId: partnerLink?.id ?? null,
      shortLink: partnerLink?.shortLink ?? null,
      responseKeys: asRecord(partnerLinkResponse)
        ? Object.keys(asRecord(partnerLinkResponse) as Record<string, unknown>)
        : null,
    });
    if (!partnerLink) {
      throw new Error("referral_link_not_created");
    }

    console.log("[ambassador.provision] request:success", {
      userId: user.id,
      partnerId: partner.id,
      linkId: partnerLink.id,
    });
    return NextResponse.json({
      partnerId: partner.id ?? null,
      partnerTenantId: partner.tenantId ?? user.id,
      linkId: partnerLink.id,
      shortLink: partnerLink.shortLink ?? null,
      qrCode: qrCodeForShortLink(partnerLink.shortLink, partnerLink.qrCode),
      key,
      destinationUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "referral_provision_failed";
    const lowered = message.toLowerCase();
    const isUsernameUnavailable =
      lowered.includes("already") ||
      lowered.includes("taken") ||
      lowered.includes("exists") ||
      lowered.includes("duplicate");

    if (isUsernameUnavailable) {
      return NextResponse.json({ error: "username_unavailable" }, { status: 409 });
    }

    if (lowered.includes("invalid") && lowered.includes("username")) {
      return NextResponse.json({ error: "username_invalid" }, { status: 400 });
    }

    console.log("[ambassador.provision] request:error", {
      userId: user.id,
      message,
    });
    return NextResponse.json(
      {
        error: "referral_provision_unavailable",
      },
      { status: 502 }
    );
  }
}
