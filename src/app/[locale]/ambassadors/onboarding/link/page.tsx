"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { CopyButton } from "@/components/ui/copy-button";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { formatDisplayLink } from "@/lib/ambassador-link";
import { buildDubQrDisplayUrl } from "@/lib/dub-qr";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// 503s from the link route: the referral provider or profile storage is missing or
// misconfigured. None of them is a verdict on the ambassador's username.
const SERVICE_UNAVAILABLE_CODES = new Set([
  "referral_service_unavailable",
  "referral_link_unavailable",
  "referral_destination_domain_invalid",
  "referral_destination_url_invalid",
  "profile_storage_unavailable",
  "missing_email",
]);

export default function AmbassadorOnboardingLinkPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const tc = useTranslations("Common");
  const t = useTranslations("OnboardingAmbassadorLink");
  const [shortLink, setShortLink] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [qrCodeFailed, setQrCodeFailed] = useState(false);
  const [useFallbackQr, setUseFallbackQr] = useState(false);
  const [qrImageLoaded, setQrImageLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);
  const hasProvisionAttemptedRef = useRef(false);
  const qrImageRef = useRef<HTMLImageElement | null>(null);

  useRequireSessionKey("onboarding_ambassador_email", "/ambassadors/onboarding/phone");
  useRequireSessionKey("onboarding_ambassador_username", "/ambassadors/onboarding/username");

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const storedShortLink = sessionStorage.getItem("onboarding_ambassador_shortLink") ?? "";
    const storedQrCode = sessionStorage.getItem("onboarding_ambassador_qrCode") ?? "";
    setShortLink(storedShortLink);
    setQrCodeUrl(storedQrCode);
    setQrCodeFailed(false);
    setUseFallbackQr(false);

    if (storedShortLink) {
      return;
    }

    const email = sessionStorage.getItem("onboarding_ambassador_email") ?? "";
    const phone = sessionStorage.getItem("onboarding_ambassador_phone") ?? "";
    const username = sessionStorage.getItem("onboarding_ambassador_username") ?? "";
    const usernameDisplay = sessionStorage.getItem("onboarding_ambassador_username_display") ?? "";
    const firstName = sessionStorage.getItem("onboarding_ambassador_firstName") ?? "";
    const lastName = sessionStorage.getItem("onboarding_ambassador_lastName") ?? "";
    const preferredName = sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "";
    const city = sessionStorage.getItem("onboarding_ambassador_city") ?? "";
    const displayName = sessionStorage.getItem("onboarding_ambassador_displayName") || preferredName || firstName;

    if (!username) {
      setError(t("usernameMissing"));
      return;
    }

    // Prevent duplicate provisioning requests under React Strict Mode.
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
            phone,
            locale,
            username,
            usernameDisplay,
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
            // the route already separates a bad username from a service that is not
            // configured; collapsing the second onto usernameClaimFailed told the
            // ambassador their username was the problem when it was not
            if (code === "username_unavailable") {
              setError(t("usernameUnavailable"));
            } else if (code === "username_invalid" || code === "username_required") {
              setError(t("usernameInvalid"));
            } else if (SERVICE_UNAVAILABLE_CODES.has(code)) {
              setError(t("serviceUnavailable"));
            } else if (code === "unauthorized") {
              setError(t("sessionExpired"));
            } else {
              setError(t("linkSetupFailed"));
            }
          }
          return;
        }

        const nextCanonicalUsername = username;
        const nextKey = payload?.key?.trim() || usernameDisplay || username;
        const nextShortLink = payload?.shortLink ?? "";
        const nextQrCode = payload?.qrCode ?? "";

        sessionStorage.setItem("onboarding_ambassador_username", nextCanonicalUsername);
        if (usernameDisplay) {
          sessionStorage.setItem("onboarding_ambassador_username_display", usernameDisplay);
        }
        sessionStorage.setItem("onboarding_ambassador_linkKey", nextKey);
        if (payload?.linkId) {
          sessionStorage.setItem("onboarding_ambassador_linkId", payload.linkId);
        }
        if (nextShortLink) {
          sessionStorage.setItem("onboarding_ambassador_shortLink", nextShortLink);
          new Image().src = buildDubQrDisplayUrl(nextShortLink);
        }
        if (nextQrCode) {
          sessionStorage.setItem("onboarding_ambassador_qrCode", nextQrCode);
        }

        if (isMountedRef.current) {
          setShortLink(nextShortLink);
          setQrCodeUrl(nextQrCode);
        }
      } catch {
        // an aborted or failed request says nothing about the username
        if (isMountedRef.current) {
          setError(t("linkSetupFailed"));
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

  const preferredQrCodeUrl = shortLink ? buildDubQrDisplayUrl(shortLink) : "";
  const fallbackQrCodeUrl = qrCodeUrl || preferredQrCodeUrl;
  const resolvedQrCodeUrlBase = useFallbackQr ? fallbackQrCodeUrl : preferredQrCodeUrl || qrCodeUrl;
  const resolvedQrCodeUrl = resolvedQrCodeUrlBase;

  useEffect(() => {
    setQrImageLoaded(false);
  }, [resolvedQrCodeUrl]);

  useEffect(() => {
    if (!resolvedQrCodeUrl) return;
    const img = qrImageRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setQrImageLoaded(true);
    }
  }, [resolvedQrCodeUrl]);

  // the last resort when both clipboard paths fail — prompt keeps the link selectable
  const handleCopyUnavailable = useCallback(
    (text: string) => {
      if (typeof window !== "undefined") {
        window.prompt(t("copyFallbackPrompt"), text);
      }
    },
    [t]
  );

  const handleDownloadQr = async () => {
    if (!resolvedQrCodeUrl) return;

    const fileBase =
      (sessionStorage.getItem("onboarding_ambassador_linkKey") ?? "ambassador-link").trim() || "ambassador-link";
    const fileName = `${fileBase}-qr.png`;

    try {
      const response = await fetch(resolvedQrCodeUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("qr_download_failed");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback for environments where remote blob fetching is blocked by CORS.
      const anchor = document.createElement("a");
      anchor.href = resolvedQrCodeUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  };

  const qrPending = (
    <div className="flex flex-col items-center justify-center gap-[12px] text-center">
      <div
        className="h-[56px] w-[56px] animate-spin rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(194,10,71,1) 0deg, rgba(194,10,71,0.78) 92deg, rgba(194,10,71,0.34) 190deg, rgba(194,10,71,0.08) 285deg, rgba(194,10,71,0) 360deg)",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 0)",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 0)",
        }}
        aria-hidden="true"
      />

      <div className="max-w-[213px]">
        <p
          className="text-[14px] font-semibold leading-[20px] text-[#C20A47]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("qrGenerating")}
        </p>
        <p
          className="mt-[4px] text-[13px] font-normal leading-[18px] text-[#6b7280]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("qrGeneratingHint")}
        </p>
      </div>
    </div>
  );

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px] pb-[24px]">
        <div className="flex flex-col gap-[8px]">
          <h1
            className="text-[28px] font-extrabold leading-[1.04] text-[#1c1c1e]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p
            className="text-[16px] font-normal leading-[22px] text-[#6E6E73]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("subtext")}
          </p>
        </div>

        {/* Figma node 5439:21354 uses a near full-width QR card (345px in a 393px frame).
            It is the column's width up to that, and square, so a 360/375px phone
            never scrolls sideways; the QR keeps the design's 18px inset. */}
        <div className="mt-[13px] flex justify-center">
          <div
            className="relative flex aspect-square w-full max-w-[345px] items-center justify-center overflow-hidden rounded-[24px] bg-white"
            style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.031)" }}
          >
            {resolvedQrCodeUrl && !qrCodeFailed ? (
              <>
                {!qrImageLoaded ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white">{qrPending}</div>
                ) : null}

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={qrImageRef}
                  src={resolvedQrCodeUrl}
                  alt={t("qrAlt")}
                  className={`size-[calc(100%-36px)] object-contain transition-opacity duration-150 ${qrImageLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={() => setQrImageLoaded(true)}
                  onError={() => {
                    if (!useFallbackQr && fallbackQrCodeUrl) {
                      setQrImageLoaded(false);
                      setUseFallbackQr(true);
                      return;
                    }
                    setQrCodeFailed(true);
                  }}
                />
              </>
            ) : !resolvedQrCodeUrl ? (
              qrPending
            ) : (
              <p
                className="max-w-[213px] text-center text-[14px] font-medium leading-[20px] text-[#6b7280]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("qrMissing")}
              </p>
            )}
          </div>
        </div>

        {error ? (
          <p
            className="mt-[8px] text-center text-[13px] font-medium leading-[18px] text-[#b42318]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {error}
          </p>
        ) : null}

        <div className="mt-[8px] flex justify-center">
          <button
            type="button"
            onClick={handleDownloadQr}
            disabled={!resolvedQrCodeUrl}
            className={`flex items-center gap-[8px] text-[14px] font-medium ${resolvedQrCodeUrl ? "text-[#000000]" : "cursor-not-allowed text-[#a1a1aa]"}`}
            style={{ fontFamily: "var(--font-inter)", fontStyle: "normal", lineHeight: "normal" }}
          >
            <Download
              size={16}
              strokeWidth={2}
              aria-hidden="true"
            />
            {t("downloadQr")}
          </button>
        </div>

        <div className="mt-[24px] flex h-[46px] w-full items-center justify-between gap-[12px] rounded-[12px] border border-[#E5E7EB] bg-[#F9FAFB] px-[14px]">
          <span
            className="truncate text-[14px] font-semibold leading-[16.94px] text-[#111828]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {shortLink ? formatDisplayLink(shortLink) : t("linkMissing")}
          </span>

          <CopyButton
            value={shortLink}
            label={t("copy")}
            size={18}
            className="shrink-0"
            onUnavailable={handleCopyUnavailable}
          />
        </div>
      </main>

      <ScreenFooter
        label={tc("continue")}
        onClick={() => router.push(`/${locale}/ambassadors/onboarding/you-are-live`)}
        disabled={!shortLink || loading || Boolean(error)}
      />
    </div>
  );
}
