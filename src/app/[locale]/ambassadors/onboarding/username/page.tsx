"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { FloatingInput } from "@/components/ui/floating-input";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { buildAmbassadorLinkPreview } from "@/lib/ambassador-link";
import { checkUsernameAvailability } from "@/services/ambassadors";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,29}$/;
const USERNAME_DISPLAY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._]{2,29}$/;
const USERNAME_FIELD_ID = "ambassadorUsername";

// the missing environment variable names are a developer diagnostic — production
// only ever sees the generic "contact support" line
const SHOW_CONFIGURATION_DETAIL = process.env.NODE_ENV !== "production";

// one entry per outcome the availability check can produce, so a server that is
// missing configuration never tells an ambassador their username is malformed
type UsernameFeedback =
  { kind: "required" | "invalid" | "taken" | "unavailable" } | { kind: "configuration"; missing: string[] };

function sanitizeDisplayUsername(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._]+/g, "");
}

function normalizeCanonicalUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._]+/g, "");
}

export default function AmbassadorOnboardingUsernamePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorLocation");
  const tc = useTranslations("Common");

  useRequireSessionKey("onboarding_ambassador_preferredName", "/ambassadors/onboarding/name");

  const initial =
    typeof window !== "undefined"
      ? sanitizeDisplayUsername(
          sessionStorage.getItem("onboarding_ambassador_username_display") ??
            sessionStorage.getItem("onboarding_ambassador_username") ??
            ""
        ).slice(0, 30)
      : "";
  const [username, setUsername] = useState(initial);
  const [feedback, setFeedback] = useState<UsernameFeedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const sanitizedDisplayUsername = sanitizeDisplayUsername(username);
  const canonicalUsername = normalizeCanonicalUsername(sanitizedDisplayUsername);
  const isDisplayValid = USERNAME_DISPLAY_PATTERN.test(sanitizedDisplayUsername);
  const isUsernameValid = USERNAME_PATTERN.test(canonicalUsername) && isDisplayValid;

  const isTaken = feedback?.kind === "taken";
  // the link is the promise the username makes, so it appears only once the
  // username can actually become one (Figma 3749:14543 — the empty and taken
  // frames have no link block)
  const showLinkPreview = isUsernameValid && !isTaken;

  // one message per outcome — a server that cannot answer never reads as a
  // malformed username
  const feedbackMessage = (kind: UsernameFeedback["kind"]): string => {
    switch (kind) {
      case "required":
        return t("required");
      case "invalid":
        return t("usernameInvalid");
      case "taken":
        return t("usernameTaken");
      case "configuration":
        return t("configError");
      case "unavailable":
        return t("checkFailed");
    }
  };

  // Figma paints the field magenta once the username is valid and red once it is
  // taken; FloatingInput only reddens its border when it also owns the message,
  // and here the message belongs under the helper line, so the border colour is
  // set from outside rather than by forking the field.
  const fieldBorderClass = isTaken
    ? "[&_[aria-hidden]]:!border-[#ef4444]"
    : isUsernameValid
      ? "[&_[aria-hidden]]:!border-[#cc007e]"
      : "";

  const handleContinue = async () => {
    const rawInputValue = usernameInputRef.current?.value ?? username;
    const nextDisplayUsername = sanitizeDisplayUsername(rawInputValue).slice(0, 30);
    const nextCanonicalUsername = normalizeCanonicalUsername(nextDisplayUsername);
    const nextDisplayValid = USERNAME_DISPLAY_PATTERN.test(nextDisplayUsername);
    const nextUsernameValid = USERNAME_PATTERN.test(nextCanonicalUsername) && nextDisplayValid;

    if (nextDisplayUsername !== username) {
      setUsername(nextDisplayUsername);
    }

    if (!nextCanonicalUsername) {
      setFeedback({ kind: "required" });
      return;
    }
    if (!nextUsernameValid) {
      setFeedback({ kind: "invalid" });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const result = await checkUsernameAvailability(nextCanonicalUsername);

      if (result.status === "taken") {
        setFeedback({ kind: "taken" });
        return;
      }
      if (result.status === "invalid") {
        setFeedback({ kind: "invalid" });
        return;
      }
      if (result.status === "misconfigured") {
        setFeedback({ kind: "configuration", missing: result.missing });
        return;
      }
      if (result.status === "unavailable") {
        setFeedback({ kind: "unavailable" });
        return;
      }

      sessionStorage.setItem("onboarding_ambassador_username", nextCanonicalUsername);
      sessionStorage.setItem("onboarding_ambassador_username_display", nextDisplayUsername);
      sessionStorage.setItem("onboarding_ambassador_linkKey", nextCanonicalUsername);
      sessionStorage.setItem("onboarding_ambassador_locale", locale);
      router.push(`/${locale}/ambassadors/onboarding/phone`);
    } catch {
      // the service answers every failed request, so a throw here is unexpected
      // — still not a reason to blame the username
      setFeedback({ kind: "unavailable" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        <h1
          className="text-[28px] font-extrabold leading-[29.12px] text-[#111]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <p
          className="mt-[8px] mb-[20px] text-[16px] font-normal leading-[19.36px] text-[#5c5c5c]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("subtext")}
        </p>

        <div className={fieldBorderClass}>
          <FloatingInput
            id={USERNAME_FIELD_ID}
            label={t("label")}
            value={username}
            inputRef={usernameInputRef}
            onChange={(value) => {
              setUsername(sanitizeDisplayUsername(value).slice(0, 30));
              if (feedback) setFeedback(null);
            }}
            reserveErrorSpace={false}
            focusBorderColor="#CC007E"
            focusBorderWidth="1px"
          />
        </div>

        <p
          className="mt-[8px] text-[12px] font-normal leading-[16px] text-[#8e8e93]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("helper")}
        </p>

        {feedback && (
          // the field's aria-describedby already points here, so the message
          // stays attached to the input while sitting below the helper line
          <p
            id={`${USERNAME_FIELD_ID}-error`}
            role="alert"
            aria-live="polite"
            className={`mt-[12px] text-[14px] font-semibold leading-[16.94px] ${isTaken ? "text-[#ef4444]" : "text-[#cc007e]"}`}
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {feedbackMessage(feedback.kind)}
            {feedback.kind === "configuration" && SHOW_CONFIGURATION_DETAIL && feedback.missing.length > 0 && (
              <span className="mt-[4px] block text-[12px] font-normal leading-[16px] text-[#8e8e93]">
                {feedback.missing.join(", ")}
              </span>
            )}
          </p>
        )}

        {showLinkPreview && (
          <div className="mt-[16px] flex flex-col gap-[4px]">
            <p
              className="text-[12px] font-semibold uppercase leading-[14.52px] text-[#8e8e93]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("linkTitle")}
            </p>

            <p
              className="text-[14px] font-medium leading-[16.94px] text-[#1c1c1e]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {buildAmbassadorLinkPreview(sanitizedDisplayUsername)}
            </p>
          </div>
        )}
      </main>

      <ScreenFooter
        label={tc("continue")}
        onClick={handleContinue}
        disabled={!isUsernameValid || isSubmitting}
      />
    </div>
  );
}
