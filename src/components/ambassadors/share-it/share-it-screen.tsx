"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { CopyButton } from "@/components/ui/copy-button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { buildAmbassadorLinkPreview, formatDisplayLink, toAbsoluteLink } from "@/lib/ambassador-link";
import { buildDubQrDisplayUrl } from "@/lib/dub-qr";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";

type ShareRow = {
  id: string;
  label: string;
};

type ShareItVariant = "onboarding" | "dashboard";

// Kept as a key rather than a rendered string so a locale switch re-translates it.
type ShareErrorKey = "shareUnavailable" | "shareRequiresHttps";

const PERSONAL_MESSAGE_KEY = "onboarding_ambassador_shareMessage";

// Figma 4093:14047 / 4093:14048 — the card is padded 24 with a 20px gap, and the
// shared header already draws the top 24.
const DIALOG_BODY = "flex flex-col gap-[20px] px-[24px] pt-[20px] pb-[24px]";
const DIALOG_PRIMARY =
  "flex h-[52px] w-full items-center justify-center rounded-[12px] text-[16px] font-semibold leading-[21.82px]";
const SHARE_DIALOG_OVERLAY_CLASS = "bg-[rgba(17,24,39,0.36)]";

function toAbsoluteHttpUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const direct = new URL(trimmed);
    if (direct.protocol === "http:" || direct.protocol === "https:") {
      return direct.toString();
    }
  } catch {
    // Continue with heuristic below.
  }

  // Accept a bare host/path — the short link is stored without a scheme — and coerce to https.
  if (/^[^\s.]+\.[^\s]+/.test(trimmed)) {
    try {
      const inferred = new URL(`https://${trimmed}`);
      return inferred.toString();
    } catch {
      return null;
    }
  }

  return null;
}

async function readImageBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob && blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

type QrAsset = { objectUrl: string; file: File };

async function loadQrAsset(qrUrl: string): Promise<QrAsset | null> {
  // Dub's QR endpoint sends no CORS headers, so a direct cross-origin fetch()
  // fails silently — route those through our own same-origin proxy. A
  // same-origin or data: URL can be fetched directly. Fetched once and reused
  // for both the preview <img> and the share file.
  const isCrossOriginHttp =
    /^https?:\/\//i.test(qrUrl) && typeof window !== "undefined" && !qrUrl.startsWith(window.location.origin);
  const fetchUrl = isCrossOriginHttp ? `/api/ambassadors/qr-image?url=${encodeURIComponent(qrUrl)}` : qrUrl;

  const blob = await readImageBlob(fetchUrl);
  if (!blob) return null;

  const mimeType = blob.type && blob.type.trim().length > 0 ? blob.type : "image/png";
  const extension = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
  const file = new File([blob], `haa-qr-code.${extension}`, { type: mimeType });
  return { objectUrl: URL.createObjectURL(blob), file };
}

export function ShareItScreen({ variant }: { variant: ShareItVariant }) {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("AmbassadorShare");
  const tShare = useTranslations("OnboardingAmbassadorShare");
  const [activeDialogId, setActiveDialogId] = useState<string | null>(null);
  const [shareErrorKey, setShareErrorKey] = useState<ShareErrorKey | null>(null);
  const [shortLink, setShortLink] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [qrShareFile, setQrShareFile] = useState<File | null>(null);
  const [qrObjectUrl, setQrObjectUrl] = useState("");
  const [preferredName, setPreferredName] = useState("Brand Ambassador");
  const [usernameHandle, setUsernameHandle] = useState("username");
  const [personalMessage, setPersonalMessage] = useState("");
  const isDialogOpen = activeDialogId !== null;

  useEffect(() => {
    setShortLink(sessionStorage.getItem("onboarding_ambassador_shortLink") ?? "");
    setQrCodeUrl(sessionStorage.getItem("onboarding_ambassador_qrCode") ?? "");
    const storedPreferredName = sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "";
    const storedFirstName = sessionStorage.getItem("onboarding_ambassador_firstName") ?? "";
    const storedUsernameDisplay = sessionStorage.getItem("onboarding_ambassador_username_display") ?? "";
    const storedUsername = sessionStorage.getItem("onboarding_ambassador_username") ?? "";
    const fallbackName = storedPreferredName.trim() || storedFirstName.trim() || "Brand Ambassador";
    const fallbackHandle = storedUsernameDisplay.trim() || storedUsername.trim() || "username";
    setPreferredName(fallbackName);
    setUsernameHandle(fallbackHandle);
    setPersonalMessage(sessionStorage.getItem(PERSONAL_MESSAGE_KEY) ?? "");

    void (async () => {
      try {
        const response = await fetch("/api/ambassadors/profile", { method: "GET" });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          personalMessage?: string | null;
          shortLink?: string | null;
          qrCode?: string | null;
          usernameDisplay?: string | null;
        } | null;

        const remoteShortLink = payload?.shortLink?.trim() ?? "";
        const remoteQrCode = payload?.qrCode?.trim() ?? "";
        const remoteUsernameDisplay = payload?.usernameDisplay?.trim() ?? "";

        // The stored link is the ambassador's; the tab's copy is only what showed
        // while this loaded, and can belong to whoever used the tab before them.
        if (remoteShortLink) {
          setShortLink(remoteShortLink);
          sessionStorage.setItem("onboarding_ambassador_shortLink", remoteShortLink);
        }

        if (remoteQrCode) {
          setQrCodeUrl(remoteQrCode);
          sessionStorage.setItem("onboarding_ambassador_qrCode", remoteQrCode);
        }

        if (remoteUsernameDisplay) {
          setUsernameHandle((current) => (current === "username" ? remoteUsernameDisplay : current));
          sessionStorage.setItem("onboarding_ambassador_username_display", remoteUsernameDisplay);
        }

        const remotePersonalMessage = payload?.personalMessage?.trim() ?? "";
        if (!remotePersonalMessage) return;
        setPersonalMessage(remotePersonalMessage);
        sessionStorage.setItem(PERSONAL_MESSAGE_KEY, remotePersonalMessage);
      } catch {
        // Keep local/session value if remote fetch fails.
      }
    })();
  }, []);

  const defaultShareMessage = useMemo(() => {
    const link = shortLink ? formatDisplayLink(shortLink) : buildAmbassadorLinkPreview(usernameHandle);
    return `${tShare("messageTemplate", { name: preferredName })}\n\n${tShare("messageLinkLine", { link })}`;
  }, [preferredName, shortLink, tShare, usernameHandle]);

  const activePersonalMessage = useMemo(() => {
    return personalMessage.trim().length > 0 ? personalMessage : defaultShareMessage;
  }, [defaultShareMessage, personalMessage]);

  useEffect(() => {
    if (activeDialogId !== "message") return;
    if (personalMessage.trim().length > 0) return;
    setPersonalMessage(activePersonalMessage);
  }, [activeDialogId, activePersonalMessage, personalMessage]);

  useEffect(() => {
    if (personalMessage.trim().length > 0) {
      sessionStorage.setItem(PERSONAL_MESSAGE_KEY, personalMessage);
    } else {
      sessionStorage.removeItem(PERSONAL_MESSAGE_KEY);
    }

    const timeoutId = window.setTimeout(() => {
      void fetch("/api/ambassadors/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftOnly: true,
          email: (sessionStorage.getItem("onboarding_ambassador_email") ?? "").trim().toLowerCase(),
          personalMessage,
        }),
      });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [personalMessage]);

  const resolvedQrCodeUrl = useMemo(() => {
    if (shortLink) return buildDubQrDisplayUrl(shortLink);
    return qrCodeUrl;
  }, [qrCodeUrl, shortLink]);

  // Fetched once, ahead of the tap: navigator.share() needs the click's
  // transient activation, which a fetch inside the click handler would
  // consume before share() ever runs. The same blob backs the <img> preview
  // so it is never downloaded twice.
  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl = "";
    setQrShareFile(null);
    setQrObjectUrl("");
    if (!resolvedQrCodeUrl) return;

    void loadQrAsset(resolvedQrCodeUrl).then((asset) => {
      if (cancelled || !asset) return;
      currentObjectUrl = asset.objectUrl;
      setQrShareFile(asset.file);
      setQrObjectUrl(asset.objectUrl);
    });

    return () => {
      cancelled = true;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [resolvedQrCodeUrl]);

  const openDialog = (id: string) => {
    setShareErrorKey(null);
    setActiveDialogId(id);
  };

  // Stable, because ModalDialog re-runs its key/scroll effects whenever onClose changes.
  const closeDialog = useCallback(() => {
    setShareErrorKey(null);
    setActiveDialogId(null);
  }, []);

  // navigator.share is absent outside a secure context, which is exactly how the
  // plain-http test host behaves — say so instead of failing silently.
  const canShare = () => {
    if (typeof navigator === "undefined") return false;
    if (typeof navigator.share === "function") return true;
    setShareErrorKey(
      typeof window !== "undefined" && !window.isSecureContext ? "shareRequiresHttps" : "shareUnavailable"
    );
    return false;
  };

  const hasNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copyLinkFallback = async (value: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(value);
      setShareErrorKey(null);
      return true;
    } catch {
      return false;
    }
  };

  const canShareFiles = (file: File) => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    if (typeof navigator.canShare !== "function") return true;
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  };

  const handleShareQr = async () => {
    if (!canShare()) return;

    if (qrShareFile && canShareFiles(qrShareFile)) {
      try {
        await navigator.share({ text: "QR code", files: [qrShareFile] });
        posthog.capture("ambassador_qr_shared", { share_method: "native_file" });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.share({ text: "QR code" });
      posthog.capture("ambassador_qr_shared", { share_method: "native_text" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareErrorKey("shareUnavailable");
    }
  };

  const handleShareLink = async () => {
    if (!shortLink) return;

    const shareUrl = toAbsoluteHttpUrl(shortLink);

    if (!hasNativeShare()) {
      const fallbackValue = shareUrl || shortLink;
      if (fallbackValue && (await copyLinkFallback(fallbackValue))) {
        posthog.capture("ambassador_link_shared", { share_method: "clipboard" });
        return;
      }
      setShareErrorKey("shareUnavailable");
      return;
    }

    if (!canShare()) return;

    try {
      if (shareUrl) {
        await navigator.share({
          title: t("haaLink"),
          text: shareUrl,
          url: shareUrl,
        });
        posthog.capture("ambassador_link_shared", { share_method: "native" });
        return;
      }

      await navigator.share({
        title: t("haaLink"),
        text: shortLink,
      });
      posthog.capture("ambassador_link_shared", { share_method: "native" });
    } catch {
      // No-op if sharing is dismissed.
    }
  };

  const handleShareMessage = async () => {
    if (!canShare()) return;
    try {
      await navigator.share({ text: activePersonalMessage });
      posthog.capture("ambassador_message_shared", { share_method: "native" });
    } catch {
      // No-op if sharing is dismissed.
    }
  };

  const rows: ShareRow[] =
    variant === "dashboard"
      ? [
          { id: "qr", label: t("qrCode") },
          { id: "link", label: t("haaLink") },
          { id: "message", label: t("personalMessage") },
        ]
      : [
          { id: "qr", label: t("qrCode") },
          { id: "link", label: t("haaLink") },
        ];

  const shareError = shareErrorKey ? (
    <p
      role="alert"
      className="text-center text-[12px] leading-[16px] text-[#cc007e]"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      {t(shareErrorKey)}
    </p>
  ) : null;

  return (
    <div className="h-dvh flex flex-col items-center bg-white">
      <StatusBarPlaceholder />
      <div className={`w-full max-w-[393px] ${isDialogOpen ? "pointer-events-none opacity-0" : ""}`}>
        <ScreenHeader showCallButton={false} />
      </div>

      <main
        aria-hidden={isDialogOpen}
        className={`w-full max-w-[393px] flex-1 overflow-y-auto px-[24px] pt-[32px] pb-[32px] ${isDialogOpen ? "pointer-events-none opacity-0" : ""}`}
      >
        <h1
          className="text-[28px] font-extrabold leading-[29.12px] text-[#111111]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <p
          className="mt-[8px] text-[16px] font-normal leading-[22px] text-[#6E6E73]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("subtext")}
        </p>

        <div className="mt-[24px] flex flex-col gap-[12px]">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => openDialog(row.id)}
              className="flex h-[47px] w-full items-center rounded-[14px] border border-[#E5E7EB] bg-white px-[20px] text-left"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              <span className="text-[16px] font-semibold leading-[15px] text-[#1C1C1E]">{row.label}</span>
            </button>
          ))}
        </div>
      </main>

      <ModalDialog
        open={activeDialogId === "qr"}
        onClose={closeDialog}
        title={t("yourQrCode")}
        showCloseButton={false}
        cardClassName="max-w-[367px]"
        overlayClassName={SHARE_DIALOG_OVERLAY_CLASS}
      >
        <div className={DIALOG_BODY}>
          {resolvedQrCodeUrl ? (
            <div className="mx-auto flex h-[292px] w-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrObjectUrl || resolvedQrCodeUrl}
                alt={t("qrCode")}
                className="h-[276px] w-[276px] rounded-[8px] bg-white object-contain"
              />
            </div>
          ) : (
            <p
              className="text-center text-[14px] font-normal leading-[20px] text-[#6E6E73]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("qrPending")}
            </p>
          )}

          <div className="flex flex-col gap-[8px]">
            {shareError}
            <button
              type="button"
              onClick={handleShareQr}
              disabled={!resolvedQrCodeUrl}
              className={`${DIALOG_PRIMARY} ${
                resolvedQrCodeUrl ? "bg-[#CC007E] text-white" : "cursor-not-allowed bg-[#E5E7EB] text-[#9CA3AF]"
              }`}
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("shareQrCode")}
            </button>
          </div>
        </div>
      </ModalDialog>

      <ModalDialog
        open={activeDialogId === "link"}
        onClose={closeDialog}
        title={t("yourHaaLink")}
        showCloseButton={false}
        overlayClassName={SHARE_DIALOG_OVERLAY_CLASS}
      >
        <div className={DIALOG_BODY}>
          {shortLink ? (
            <div className="flex h-[46px] w-full items-center justify-between gap-[12px] rounded-[12px] border border-[#E5E7EB] bg-[#F9FAFB] px-[14px]">
              <p
                className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-[16.94px] text-[#111828]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {formatDisplayLink(shortLink)}
              </p>

              <CopyButton
                value={toAbsoluteLink(shortLink)}
                label={t("copyLink")}
                size={18}
                className="size-[18px] shrink-0"
              />
            </div>
          ) : (
            <p
              className="text-center text-[14px] font-normal leading-[20px] text-[#6E6E73]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("linkPending")}
            </p>
          )}

          <div className="flex flex-col gap-[8px]">
            {shareError}
            <button
              type="button"
              onClick={handleShareLink}
              disabled={!shortLink}
              className={`${DIALOG_PRIMARY} ${
                shortLink ? "bg-[#CC007E] text-white" : "cursor-not-allowed bg-[#E5E7EB] text-[#9CA3AF]"
              }`}
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("shareQrCode")}
            </button>
          </div>
        </div>
      </ModalDialog>

      <ModalDialog
        open={activeDialogId === "message"}
        onClose={closeDialog}
        title={t("personalMessage")}
        showCloseButton={false}
        overlayClassName={SHARE_DIALOG_OVERLAY_CLASS}
      >
        <div className={DIALOG_BODY}>
          <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F9FAFB] px-[14px] py-[14px]">
            <textarea
              value={personalMessage}
              onChange={(event) => setPersonalMessage(event.target.value)}
              placeholder={defaultShareMessage}
              className="min-h-[138px] max-h-[40dvh] w-full resize-none overflow-y-auto whitespace-pre-line break-words border-0 bg-transparent p-0 text-[14px] font-normal leading-[20px] text-[#111828] outline-none placeholder:text-[#6E6E73]"
              style={{ fontFamily: "var(--font-inter)" }}
            />
          </div>

          <div className="flex flex-col gap-[8px]">
            {shareError}
            <button
              type="button"
              onClick={handleShareMessage}
              className={`${DIALOG_PRIMARY} bg-[#CC007E] text-white`}
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("shareQrCode")}
            </button>
          </div>
        </div>
      </ModalDialog>

      <div className={`w-full max-w-[393px] ${isDialogOpen ? "invisible" : ""}`}>
        <ScreenFooter
          label={t("goToDashboard")}
          onClick={() => router.push(`/${locale}/ambassadors/dashboard`)}
        />
      </div>
    </div>
  );
}
