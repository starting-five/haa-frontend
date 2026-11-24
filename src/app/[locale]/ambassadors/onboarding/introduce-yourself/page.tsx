"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { AMBASSADOR_LINK_HOST, buildAmbassadorLinkPreview, toAbsoluteLink } from "@/lib/ambassador-link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

const PERSONAL_MESSAGE_KEY = "onboarding_ambassador_shareMessage";

// The referral link anywhere inside the personal message, with or without a
// scheme — the ambassador can retype it, so we match the host rather than a
// fixed handle.
const AMBASSADOR_LINK_PATTERN = new RegExp(`(?:https?://)?${AMBASSADOR_LINK_HOST.replace(/\./g, "\\.")}/\\S*`, "gi");

interface MessageSegment {
  text: string;
  isLink: boolean;
}

// Figma 3909:12551 gives the message two runs — the body in plain Inter grey and
// the referral link in bold magenta — so the display form has to be real markup.
// A textarea can only paint its whole value one colour.
function splitMessageAroundLink(message: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  for (const match of message.matchAll(AMBASSADOR_LINK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ text: message.slice(cursor, start), isLink: false });

    // Sentence punctuation after the link is not part of the link.
    const raw = match[0];
    const link = raw.replace(/[.,!?]+$/, "");
    segments.push({ text: link, isLink: true });
    if (link.length < raw.length) segments.push({ text: raw.slice(link.length), isLink: false });

    cursor = start + raw.length;
  }

  if (cursor < message.length) segments.push({ text: message.slice(cursor), isLink: false });
  return segments;
}

export default function AmbassadorScanCreditSplashPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorShare");
  const [preferredName, setPreferredName] = useState("Brand Ambassador");
  const [shareError, setShareError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [usernameHandle, setUsernameHandle] = useState("username");
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const { copied, copy } = useCopyToClipboard({ onUnavailable: () => setShareError(t("copyFailed")) });

  useRequireSessionKey("onboarding_ambassador_email", "/ambassadors/onboarding/phone");

  useEffect(() => {
    const storedPreferredName = sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "";
    const storedFirstName = sessionStorage.getItem("onboarding_ambassador_firstName") ?? "";
    const storedUsernameDisplay = sessionStorage.getItem("onboarding_ambassador_username_display") ?? "";
    const storedUsername = sessionStorage.getItem("onboarding_ambassador_username") ?? "";
    const fallbackName = storedPreferredName.trim() || storedFirstName.trim() || "Brand Ambassador";
    const fallbackHandle = storedUsernameDisplay.trim() || storedUsername.trim() || "username";
    setPreferredName(fallbackName);
    setUsernameHandle(fallbackHandle);
  }, []);

  const shareMessage = useMemo(
    () =>
      `${t("messageTemplate", { name: preferredName })}\n\n${t("messageLinkIntro")} ${buildAmbassadorLinkPreview(usernameHandle)}`,
    [preferredName, t, usernameHandle]
  );

  useEffect(() => {
    const storedMessage = sessionStorage.getItem(PERSONAL_MESSAGE_KEY) ?? "";
    if (storedMessage.trim().length > 0) {
      setMessageText(storedMessage);
    } else {
      setMessageText(shareMessage);
    }

    void (async () => {
      try {
        const response = await fetch("/api/ambassadors/profile", { method: "GET" });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as { personalMessage?: string | null } | null;
        const remotePersonalMessage = payload?.personalMessage?.trim() ?? "";
        if (!remotePersonalMessage) return;
        setMessageText(remotePersonalMessage);
        sessionStorage.setItem(PERSONAL_MESSAGE_KEY, remotePersonalMessage);
      } catch {
        // Keep local/session value if remote fetch fails.
      }
    })();
  }, [shareMessage]);

  useEffect(() => {
    if (messageText.trim().length > 0) {
      sessionStorage.setItem(PERSONAL_MESSAGE_KEY, messageText);
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
          personalMessage: messageText,
        }),
      });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [messageText]);

  // Editing continues where the ambassador left off rather than at character zero.
  useEffect(() => {
    if (!isEditingMessage) return;
    const input = messageInputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [isEditingMessage]);

  const activeMessage = messageText.trim().length > 0 ? messageText : shareMessage;
  const messageSegments = useMemo(() => splitMessageAroundLink(messageText), [messageText]);
  const nextPath = `/${locale}/ambassadors/onboarding/share-it`;
  const detectedShareUrl = useMemo(() => {
    const linkSegment = splitMessageAroundLink(activeMessage).find((segment) => segment.isLink);
    if (!linkSegment) return null;
    return toAbsoluteLink(linkSegment.text);
  }, [activeMessage]);

  const shareText = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      const payloads: ShareData[] = [{ text: activeMessage }];
      if (detectedShareUrl) {
        payloads.push({ text: activeMessage, url: detectedShareUrl });
        payloads.push({ url: detectedShareUrl });
      }

      for (const payload of payloads) {
        try {
          await navigator.share(payload);
          setShareError("");
          return;
        } catch (error) {
          // User cancel of share sheet is non-fatal.
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
    }

    const copiedOk = await copy(activeMessage);
    if (copiedOk) {
      setShareError("");
      return;
    }

    setShareError(t("copyFailed"));
  };

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white overflow-hidden">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="w-full flex flex-1 min-h-0 flex-col overflow-y-auto px-[24px] pt-[32px] pb-[12px]">
        <h1
          className="text-[28px] font-extrabold leading-[29.12px] text-[#111]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        {/* the frame stacks the illustration flush against the card — 32px under the title, 150px tall */}
        <div className="mt-[32px] flex shrink-0 justify-center">
          <Image
            src="/assets/ambassador/onboarding/haa-share.png"
            alt={t("illustrationAlt")}
            width={182}
            height={150}
            priority
            className="h-[150px] w-[182px] max-w-full object-contain"
          />
        </div>

        {/* Modal Card, 355x323 — 5px wider than the 24px page gutter on each side */}
        <div className="-mx-[5px] flex h-[323px] shrink-0 flex-col rounded-[12px] bg-white px-[24px] pb-[2px] pt-[24px]">
          <p
            className="text-[20px] font-extrabold leading-[27.28px] text-[#111828]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("personalMessage")}
          </p>

          <div className="mt-[12px] h-[192px] rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] p-[16px]">
            {isEditingMessage ? (
              <textarea
                ref={messageInputRef}
                value={messageText}
                onChange={(event) => {
                  setMessageText(event.target.value);
                  setShareError("");
                }}
                onBlur={() => setIsEditingMessage(false)}
                aria-label={t("personalMessage")}
                className="h-[160px] w-full resize-none border-0 bg-transparent p-0 text-[14px] font-normal leading-[20px] text-[#1c1c1e] outline-none"
                style={{ fontFamily: "var(--font-inter)" }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingMessage(true)}
                aria-label={t("editMessage")}
                className="block h-[160px] w-full overflow-y-auto whitespace-pre-wrap break-words text-left text-[14px] font-normal leading-[20px] text-[#1c1c1e]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {messageSegments.map((segment, index) => (
                  <span
                    key={`${index}-${segment.text}`}
                    className={segment.isLink ? "font-bold text-[#cc007e]" : undefined}
                  >
                    {segment.text}
                  </span>
                ))}
              </button>
            )}
          </div>

          {copied ? (
            <p
              className="mt-[8px] text-[12px] font-medium text-[#cc007e]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("copied")}
            </p>
          ) : null}
        </div>
      </main>

      <ScreenFooter
        label={t("shareCta")}
        onClick={shareText}
        error={shareError}
        secondaryLabel={t("doThisLater")}
        onSecondaryClick={() => router.push(nextPath)}
        secondaryVariant="link"
      />
    </div>
  );
}
