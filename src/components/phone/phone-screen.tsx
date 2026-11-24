"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { FloatingInput } from "@/components/ui/floating-input";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/constants";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type PhoneContinueResult = {
  phoneError?: string;
  emailError?: string;
};

interface PhoneScreenProps {
  heading: string;
  subtext?: string;
  onContinue: (phone: string, email: string) => void | PhoneContinueResult | Promise<void | PhoneContinueResult>;
  initialPhone?: string;
  initialEmail?: string;
  loading?: boolean;
  error?: string;
  /**
   * An action offered beside the error, for a message the patient cannot
   * resolve by retyping — "this number is already registered" is answered by
   * signing in, not by a correction. Both are cleared as soon as the number is
   * edited, the same way the code screen clears its own error.
   */
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
  showSmsDisclaimer?: boolean;
  showEmail?: boolean;
  requireEmail?: boolean;
  showEmailValidationOnType?: boolean;
  focusBorderColor?: string;
  focusBorderWidth?: string;
  emailFieldGapClassName?: string;
  showStatusBar?: boolean;
  /**
   * The Patient Flow header carries no language selector; the Brand Ambassador
   * and lawyer screens keep theirs, so this defaults to showing it.
   */
  showLanguageSelector?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formatUSPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Extract exactly the 10 raw US digits from whatever the user typed/pasted. A
// stored number comes back as +1 plus ten digits (what the flow saves), so a
// leading country code is dropped rather than counted as the area code.
function extractDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return (digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits).slice(0, 10);
}

export function PhoneScreen({
  heading,
  subtext,
  onContinue,
  initialPhone = "",
  initialEmail = "",
  loading = false,
  error,
  secondaryLabel,
  onSecondaryClick,
  showSmsDisclaimer = false,
  showEmail = true,
  requireEmail = true,
  showEmailValidationOnType = false,
  focusBorderColor = "#111",
  focusBorderWidth = "1px",
  emailFieldGapClassName = "",
  showStatusBar = true,
  showLanguageSelector = true,
}: PhoneScreenProps) {
  const t = useTranslations("PhoneScreen");
  const tc = useTranslations("Common");
  const [rawDigits, setRawDigits] = useState(extractDigits(initialPhone));
  const [email, setEmail] = useState(initialEmail);
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [hasTypedEmail, setHasTypedEmail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showError = Boolean(error) && !dismissed;

  const validateEmail = (value: string): string | undefined => {
    if (!EMAIL_PATTERN.test(value)) return t("emailError");
    return undefined;
  };

  const formattedPhone = formatUSPhone(rawDigits);
  const isPhoneComplete = rawDigits.length === 10;
  const trimmedEmail = email.trim();
  const emailValidationError = validateEmail(trimmedEmail);
  const liveEmailError =
    showEmailValidationOnType && hasTypedEmail
      ? requireEmail && trimmedEmail === ""
        ? t("emailRequired")
        : trimmedEmail !== "" && emailValidationError
          ? emailValidationError
          : ""
      : "";
  const displayedEmailError = emailError || liveEmailError;
  // A blank address is a complete answer only where the field is optional — the
  // Patient Flow labels it "Email (optional)" (Figma 2079:3292). Optional is not
  // unvalidated, though: anything actually typed still has to parse before
  // Continue is offered, so a malformed entry holds it the same way an
  // incomplete number does. Screens that hide the field are unaffected.
  const isEmailReady = !showEmail || (trimmedEmail === "" ? !requireEmail : !emailValidationError);

  // auto-focus so the native phone keypad appears as soon as the screen loads
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // a fresh message from the caller is shown even if the last one was dismissed
  useEffect(() => {
    if (error) setDismissed(false);
  }, [error]);

  // keep cursor at end after every reformat so it doesn't jump mid-string
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el) {
      el.setSelectionRange(formattedPhone.length, formattedPhone.length);
    }
  }, [formattedPhone]);

  const handlePhoneChange = (value: string) => {
    setRawDigits(extractDigits(value));
    if (phoneError) setPhoneError("");
    // A different number is a different answer, so the previous one stops
    // applying the moment it is typed.
    if (error) setDismissed(true);
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setHasTypedEmail((prev) => prev || value.length > 0);
    if (emailError) setEmailError("");
    // The footer error is about the pair of answers, not the number alone — an
    // address that was rejected stops applying once it is edited too.
    if (error) setDismissed(true);
  };

  const handleContinue = async () => {
    if (!isPhoneComplete) {
      setPhoneError(t("phoneRequired"));
      return;
    }

    if (showEmail && requireEmail && trimmedEmail === "") {
      setEmailError(t("emailRequired"));
      return;
    }
    if (showEmail && trimmedEmail !== "" && emailValidationError) {
      setEmailError(emailValidationError);
      return;
    }

    setPhoneError("");
    setEmailError("");

    const result = await onContinue("+1" + rawDigits, trimmedEmail);
    if (!result) return;

    if (result.phoneError) {
      setPhoneError(result.phoneError);
    }
    if (result.emailError) {
      setEmailError(result.emailError);
    }
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      {showStatusBar && <StatusBarPlaceholder />}
      <ScreenHeader showLanguageSelector={showLanguageSelector} />

      <form
        id="phone-form"
        className="flex-1 overflow-y-auto px-[24px] pt-[32px]"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        {/* Heading + subtitle group and the fields sit 20px apart (Figma Frame gap) */}
        <div className="flex flex-col gap-[20px]">
          {/* title-section: heading and subtitle 8px apart */}
          <div className="flex flex-col gap-[8px]">
            <h1
              className="text-[28px] font-extrabold text-[#111] leading-none"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {heading}
            </h1>

            {subtext && (
              <p
                className="text-[16px] font-normal text-[#5c5c5c] leading-normal"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {subtext}
              </p>
            )}
          </div>

          {/* the reserved error slot under each field supplies the ~20px field separation */}
          <div className="flex flex-col">
            <FloatingInput
              id="phone"
              label={t("phoneLabel")}
              type="tel"
              inputMode="tel"
              inputRef={inputRef}
              value={formattedPhone}
              onChange={handlePhoneChange}
              error={phoneError}
              focusBorderColor={focusBorderColor}
              focusBorderWidth={focusBorderWidth}
            />
            {showEmail && (
              <div className={emailFieldGapClassName}>
                <FloatingInput
                  id="email"
                  label={requireEmail ? t("emailLabel") : t("emailLabelOptional")}
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  validate={validateEmail}
                  error={displayedEmailError}
                  focusBorderColor={focusBorderColor}
                  focusBorderWidth={focusBorderWidth}
                />
              </div>
            )}
          </div>
        </div>

        {showSmsDisclaimer && (
          <div className="flex flex-col gap-[8px] pl-[3px]">
            <p
              className="text-[12px] font-normal leading-[18px] text-[#737373]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("smsDisclaimer")}
            </p>
            <div className="flex items-center gap-[8px] text-[12px] whitespace-nowrap">
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#1c1c1e] underline"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("privacyPolicy")}
              </a>
              <span className="text-[#737373]">·</span>
              <a
                href={TERMS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#1c1c1e] underline"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("terms")}
              </a>
            </div>
          </div>
        )}
      </form>

      <ScreenFooter
        label={tc("continue")}
        formId="phone-form"
        loading={loading}
        error={showError ? error : undefined}
        secondaryLabel={showError && secondaryLabel ? secondaryLabel : undefined}
        onSecondaryClick={onSecondaryClick}
        secondaryVariant="button"
        disabled={!isPhoneComplete || !isEmailReady}
      />
    </div>
  );
}
