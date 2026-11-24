"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { buildDubQrDisplayUrl } from "@/lib/dub-qr";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function buildInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || first.toUpperCase() || "A";
}

function formatDisplayLink(link: string): string {
  if (!link) return "";
  return link.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export default function AmbassadorOnboardingIdentityPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorIdentity");

  useRequireSessionKey("onboarding_ambassador_email", "/ambassadors/onboarding/phone");
  useRequireSessionKey("onboarding_ambassador_username", "/ambassadors/onboarding/profile");

  const [shortLink, setShortLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [initials, setInitials] = useState("A");
  const isMountedRef = useRef(true);
  const hasProvisionAttemptedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const storedFirstName = sessionStorage.getItem("onboarding_ambassador_firstName") ?? "";
    const storedLastName = sessionStorage.getItem("onboarding_ambassador_lastName") ?? "";
    const storedPreferredName = sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "";
    const storedDisplayName = sessionStorage.getItem("onboarding_ambassador_displayName") ?? "";
    const storedAvatarDataUrl = sessionStorage.getItem("onboarding_ambassador_avatarDataUrl") ?? "";

    setDisplayName(
      (
        storedDisplayName ||
        storedPreferredName ||
        `${storedFirstName} ${storedLastName}`.trim() ||
        storedFirstName
      ).trim()
    );
    setAvatarDataUrl(storedAvatarDataUrl);
    setInitials(buildInitials(storedFirstName, storedLastName));

    const storedShortLink = sessionStorage.getItem("onboarding_ambassador_shortLink") ?? "";
    if (storedShortLink) {
      setShortLink(storedShortLink);
      return;
    }

    const email = sessionStorage.getItem("onboarding_ambassador_email") ?? "";
    const username = sessionStorage.getItem("onboarding_ambassador_username") ?? "";
    const firstName = sessionStorage.getItem("onboarding_ambassador_firstName") ?? "";
    const lastName = sessionStorage.getItem("onboarding_ambassador_lastName") ?? "";
    const preferredName = sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "";
    const city = sessionStorage.getItem("onboarding_ambassador_city") ?? "";
    const displayName = sessionStorage.getItem("onboarding_ambassador_displayName") || preferredName || firstName;

    if (!username) {
      setError(t("missingData"));
      return;
    }

    // Guard set synchronously (before the first await) so React 18 Strict Mode's
    // dev-only double effect invoke doesn't fire two concurrent provisioning requests.
    if (hasProvisionAttemptedRef.current) {
      return;
    }
    hasProvisionAttemptedRef.current = true;

    const provisionLink = async () => {
      setLoading(true);
      setError("");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch("/api/ambassadors/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            email,
            locale,
            username,
            displayName,
            firstName,
            lastName,
            preferredName,
            city,
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          key?: string | null;
          shortLink?: string | null;
          qrCode?: string | null;
          linkId?: string | null;
        } | null;

        if (!response.ok) {
          const code = payload?.error ?? "";
          if (isMountedRef.current) {
            if (code === "username_unavailable") {
              setError(t("usernameUnavailable"));
            } else if (code === "username_invalid") {
              setError(t("usernameInvalid"));
            } else {
              setError(t("provisionFailed"));
            }
          }
          return;
        }

        const nextKey = payload?.key?.trim() || username;
        const nextShortLink = payload?.shortLink ?? "";
        const nextQrCode = payload?.qrCode ?? "";

        sessionStorage.setItem("onboarding_ambassador_username", nextKey);
        sessionStorage.setItem("onboarding_ambassador_linkKey", nextKey);
        if (payload?.linkId) {
          sessionStorage.setItem("onboarding_ambassador_linkId", payload.linkId);
        }
        if (nextShortLink) {
          sessionStorage.setItem("onboarding_ambassador_shortLink", nextShortLink);
          // Warm the browser's image cache now so the link page's QR renders instantly (Dub QR responses are cached for 1 year).
          new Image().src = buildDubQrDisplayUrl(nextShortLink);
        }
        if (nextQrCode) {
          sessionStorage.setItem("onboarding_ambassador_qrCode", nextQrCode);
        }

        if (isMountedRef.current) {
          setShortLink(nextShortLink);
        }
      } catch {
        if (isMountedRef.current) {
          setError(t("provisionFailed"));
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    void provisionLink();
  }, [locale, t]);

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="flex-1 overflow-y-auto px-[20px] pt-[32px] pb-[40px]">
        <h1
          className="text-[36px] font-extrabold leading-[34.2px] text-[#111827]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>
        <p
          className="mt-[8px] text-[16px] font-normal leading-[19px] text-[#9ca3af]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("subtext")}
        </p>

        <div className="relative mt-[64px] w-full">
          <div className="absolute left-[8px] top-[12px] h-[160px] w-[calc(100%-16px)] rounded-[16px] bg-[#1f0517]/18 blur-[8px]" />

          <div className="relative h-[186px] w-full overflow-hidden rounded-[10px] border border-[#9f0d67] bg-[radial-gradient(120%_110%_at_14%_14%,#ff1aa8_0%,#cc007e_42%,#7a0a51_100%)] px-[20px] pt-[16px]">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0)_48%)]" />

            <div className="relative z-[1]">
              <p
                className="text-[14px] font-extrabold uppercase tracking-[0.6px] text-white"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                HAA BRAND AMBASSADOR
              </p>

              <p
                className="mt-[46px] max-w-[190px] truncate text-[58px] font-extrabold leading-[0.88] text-white"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
                title={displayName || t("heading")}
              >
                {displayName || initials}
              </p>

              <p
                className="mt-[8px] max-w-[208px] break-all text-[16px] font-semibold leading-[1.2] text-white"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {shortLink ? formatDisplayLink(shortLink) : loading ? t("provisioning") : t("linkMissing")}
              </p>
            </div>

            <div className="absolute right-[16px] top-[30px] z-[2] h-[124px] w-[124px] overflow-hidden rounded-full border-[5px] border-white bg-[#f3f4f6] shadow-[0_10px_24px_rgba(22,3,16,0.45)]">
              {avatarDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarDataUrl}
                  alt={displayName || t("heading")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[40px] font-extrabold text-[#7a0a51]">
                  {initials}
                </div>
              )}
            </div>
          </div>
        </div>

        {error ? (
          <p
            className="mt-[12px] text-[13px] font-medium leading-[18px] text-[#b42318]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {error}
          </p>
        ) : null}
      </main>

      <ScreenFooter
        label={t("cta")}
        onClick={() => router.push(`/${locale}/ambassadors/onboarding/link`)}
        disabled={!shortLink || loading || Boolean(error)}
        secondaryLabel={error ? t("editProfile") : undefined}
        secondaryVariant="button"
        onSecondaryClick={() => router.push(`/${locale}/ambassadors/onboarding/profile`)}
      />
    </div>
  );
}
