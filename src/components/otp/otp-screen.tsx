"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useWebOtp } from "@/hooks/use-web-otp";
import { OTP_EXPIRY_SECONDS, otpSecondsRemaining } from "@/lib/otp-session";

// The design file draws this screen twice. The Patient Flow frames (1949:3246
// default, 1949:3317 filled, 1984:2973 verifying) and the Brand Ambassador frame
// (2168:3147) share a title block but differ in the code box, the resend control,
// and whether an expiry countdown appears at all — the Patient Flow frames carry
// none. They are one component because everything below the styling is identical.
type OtpVariant = "patient" | "ambassador";

// Sending a code and checking one are different things and used to share a
// single `loading` flag, which is why pressing Resend announced "Verifying
// code…". They are separate states now, and only one of them may say that.
export type OtpStatus = "idle" | "sending" | "verifying";

interface OtpScreenProps {
  phone: string;
  onVerify: (code: string) => void;
  onChangePhone: () => void;
  // the flows hand in async senders — the screen awaits them so it can hold the button down
  onResend: () => void | Promise<void>;
  status?: OtpStatus;
  error?: string;
  // how long a code stays good, in seconds — the width of the window the
  // countdown draws when there is no recorded send to date it from
  expirySeconds?: number;
  // The wall-clock moment the current code stops being accepted, established by
  // the send. The countdown is derived from this and `Date.now()`, so leaving
  // the screen and coming back shows the time that has actually passed rather
  // than restarting. Null means no code has been sent in this session yet.
  expiresAt?: number | null;
  // which frame to draw. Patient Flow is the default because it is what the
  // intake, patient-login and lawyer screens have always shown.
  variant?: OtpVariant;
}

const DIGITS = 6;
// how long the box stays red before clearing for a retry
const ERROR_FLASH_MS = 500;

const VARIANTS: Record<
  OtpVariant,
  {
    content: string;
    box: string;
    slot: string;
    actions: string;
    resend: string;
    verifying: string;
    countdown: boolean;
    centreResend: boolean;
  }
> = {
  // Figma 1949:3246 / 1949:3317 / 1984:2973 — a 345x56 box at radius 8 with a
  // 0.5px #D1D3D9 edge and 16px of side padding, the six characters as one
  // centred 20/500 #999999 run, "Resend code" left-aligned 14/500 and not
  // underlined, and "Verifying code..." 12px below it at 13/500 in brand.
  patient: {
    content: "gap-[32px]",
    box: "rounded-[8px] border-[0.5px] border-[#d1d3d9] px-[16px]",
    // flat #999999 across all six, including the focused cell — the frames draw
    // no active-cell highlight, that belongs to the Brand Ambassador screen
    slot: "text-[20px] font-medium leading-[24.2px] text-[#999999] data-[active=true]:text-[#999999]",
    actions: "gap-[12px]",
    resend: "self-start text-left text-[14px] font-medium leading-[16.94px] text-[#a0a0a0]",
    verifying: "text-[13px] font-medium leading-[15.73px]",
    countdown: false,
    centreResend: false,
  },
  // Figma 2168:3147 — radius 10, a #E5E5EA edge, 32px of side padding, a
  // 24/300 run, the expiry line, and a centred, underlined, bold resend.
  ambassador: {
    content: "gap-[20px]",
    box: "rounded-[10px] border-[0.5px] border-[#e5e5ea] px-[32px]",
    slot: "text-[24px] font-light leading-[29.05px]",
    actions: "gap-[8px]",
    resend: "text-center text-[16px] font-bold leading-[19.36px] text-[#a0a0a0] underline",
    verifying: "text-[14px] font-medium",
    countdown: true,
    centreResend: true,
  },
};

// mm:ss, the way the frame writes it — "09:59", never a bare "9:59"
const formatCountdown = (totalSeconds: number) => {
  const remaining = Math.max(0, totalSeconds);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function OtpScreen({
  phone,
  onVerify,
  onChangePhone,
  onResend,
  status = "idle",
  error,
  expirySeconds = OTP_EXPIRY_SECONDS,
  expiresAt = null,
  variant = "patient",
}: OtpScreenProps) {
  const style = VARIANTS[variant];
  const t = useTranslations("Otp");
  const [code, setCode] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [resending, setResending] = useState(false);

  const verifying = status === "verifying";
  const sending = status === "sending" || resending;
  const showError = Boolean(error) && !dismissed;
  // one request at a time: a verification and a send both hold the screen
  const busy = verifying || sending;

  // A number this screen has not been rendered for yet is a new verification
  // session: whatever was typed and whatever went wrong belonged to the old
  // number. Doing this on the phone rather than on mount means the reset happens
  // even where the route is reused rather than torn down and rebuilt.
  const lastPhoneRef = useRef(phone);
  useEffect(() => {
    if (lastPhoneRef.current === phone) return;
    lastPhoneRef.current = phone;
    setCode("");
    setDismissed(false);
    setVerificationAttempt(0);
  }, [phone]);

  // on a new error, flash the box red, then clear it for a fresh retry
  useEffect(() => {
    if (!error) return;
    setDismissed(false);
    const timer = setTimeout(() => setCode(""), ERROR_FLASH_MS);
    return () => clearTimeout(timer);
  }, [error, verificationAttempt]);

  // The window is a deadline, not a tally of ticks. The interval exists only to
  // redraw the number; every value it shows is recomputed from the clock, so a
  // slow tab, a backgrounded page or a spell away from the screen all come back
  // to the right answer instead of however far the counter happened to get.
  const showCountdown = style.countdown;
  const deadline = expiresAt ?? null;
  const [remaining, setRemaining] = useState(() => (deadline === null ? expirySeconds : otpSecondsRemaining(deadline)));

  useEffect(() => {
    if (!showCountdown) return;

    const read = () => setRemaining(deadline === null ? expirySeconds : otpSecondsRemaining(deadline));
    read();

    if (deadline === null) return;
    const timer = setInterval(read, 1000);
    return () => clearInterval(timer);
  }, [deadline, expirySeconds, showCountdown]);

  // Only the frame that draws a countdown holds its resend shut until the code
  // it is counting has actually run out (Figma 2170:3261). Patient Flow draws no
  // countdown and deliberately keeps resend live at all times, so this stays
  // false there and the two behaviours cannot leak into one another.
  const resendLocked = style.countdown && deadline !== null && remaining > 0;
  const resendDisabled = busy || resendLocked;

  const handleComplete = (value: string) => {
    // Verification is in progress; ignore repeat completions so one code is
    // submitted once (the real request/verification flow is unchanged).
    if (verifying) return;
    setVerificationAttempt((attempt) => attempt + 1);
    onVerify(value);
  };

  const handleChange = (value: string) => {
    setCode(value);
    if (error) setDismissed(true);
  };

  // A browser that supports WebOTP hands the code over as soon as the SMS lands.
  // It fills the field exactly as typing would and submits on the sixth digit,
  // so the detected path and the manual path end in the same place. The request
  // is armed only while the field still has room for a code.
  const detectedCode = useWebOtp({
    enabled: code.length < DIGITS,
    onDetect: (value) => {
      const digits = value.replace(/\D/g, "").slice(0, DIGITS);
      if (!digits) return;
      setCode(digits);
      if (error) setDismissed(true);
      if (digits.length === DIGITS) handleComplete(digits);
    },
  });

  const handleResend = () => {
    // a second send while one is in flight would only race the first, and the
    // ambassador frame additionally refuses until its countdown has run out
    if (resendDisabled) return;

    const pending = onResend();
    if (!(pending instanceof Promise)) return;

    setResending(true);
    // the caller owns surfacing a failure, and owns deciding whether the window
    // restarts — a send the provider refused must not mint a new one
    pending.then(
      () => setResending(false),
      () => setResending(false)
    );
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      {/* The Patient Flow header carries no language selector; the Brand
          Ambassador screens keep theirs. Both keep the Call control. */}
      <ScreenHeader showLanguageSelector={variant !== "patient"} />

      {/* Both frames open the content 32px under the header and share the title
          block exactly; they part company at the code box. Patient Flow:
          1949:3246 default, 1949:3317 filled, 1984:2973 verifying. Brand
          Ambassador: 2168:3147 default, 2170:3261 filled, 2824:8402 verifying. */}
      <div className={`flex-1 overflow-y-auto px-[24px] pt-[32px] flex flex-col ${style.content}`}>
        <div className="flex flex-col gap-[8px]">
          <h1
            className="text-[28px] font-extrabold leading-[29.12px] text-[#1e1e1e]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <div className="flex flex-col gap-[6px]">
            <p
              className="text-[16px] font-normal leading-[19.36px] text-[#5c5c5c]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("subtitle", { phone })}
            </p>
            <button
              type="button"
              onClick={onChangePhone}
              className="self-start bg-transparent p-0 text-left text-[15px] font-normal leading-[18.15px] text-[#a0a0a0] underline"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("changePhone")}
            </button>
          </div>
        </div>

        <div className={`flex flex-col ${style.actions}`}>
          <InputOTP
            maxLength={DIGITS}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            onChange={handleChange}
            onComplete={handleComplete}
            autoFocus
            autoComplete="one-time-code"
            disabled={verifying}
          >
            {/* One 345x56 box either way. Both frames draw the six characters as
                a single centred run spread across it, so the slots share the
                width evenly rather than being fixed cells — the variant supplies
                the radius, edge, side padding and type. On error the box, digits
                and dashes turn red. */}
            <InputOTPGroup
              data-error={showError ? "true" : "false"}
              className={`group h-[56px] w-full items-center justify-center gap-0 bg-white data-[error=true]:border-[#ef4444] ${style.box}`}
            >
              {Array.from({ length: DIGITS }, (_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className={`h-full flex-1 ${style.slot}`}
                  style={{ fontFamily: "var(--font-inter)" }}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>

          {showError && (
            <p
              className="text-[14px] text-[#ef4444]"
              style={{ fontFamily: "var(--font-inter)" }}
              role="alert"
            >
              {error}
            </p>
          )}

          {/* Patient Flow draws no expiry line: the resend sits 12px under the
              box and the status line 12px under that (1984:2973
              "validation-status"), all inside the one 12px column. */}
          {!style.countdown && (
            <>
              {/* Figma 1949:3317 draws "From Message: 243523" under the box. The
                  browser supplies that code through WebOTP — the page cannot read
                  an inbox — so the line appears only once a code has actually been
                  handed over, and the screen is unchanged without it. */}
              {detectedCode && (
                <p
                  className="text-[14px] font-medium leading-[16.94px] text-[#a0a0a0]"
                  style={{ fontFamily: "var(--font-inter)" }}
                  data-testid="otp-from-message"
                >
                  {t("fromMessage", { code: detectedCode })}
                </p>
              )}

              <button
                type="button"
                onClick={handleResend}
                disabled={resendDisabled}
                aria-disabled={resendDisabled}
                className={`bg-transparent p-0 disabled:opacity-50 ${style.resend}`}
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("resend")}
              </button>

              <StatusLine
                sending={sending}
                verifying={verifying}
                className={style.verifying}
                sendingLabel={t("sending")}
                verifyingLabel={t("verifying")}
              />
            </>
          )}
        </div>

        {style.countdown && (
          <>
            {/* Figma 2168:3147 "Frame 2147224378" — the expiry line, then the
                resend control centred 8px under it inside its own 8px-padded
                container */}
            <div className="flex flex-col gap-[8px]">
              <p
                className="text-center text-[14px] font-normal leading-[16.94px] text-[#6e6e73]"
                style={{ fontFamily: "var(--font-inter)" }}
                role="timer"
              >
                {t("expiresIn")} <span className="font-bold">{formatCountdown(remaining)}</span>
              </p>

              {/* Held shut, and visibly faded, until the countdown reaches 00:00;
                  the moment it does the same button becomes live with no reload
                  and no navigation. */}
              <div className="flex flex-col items-center pt-[8px]">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendDisabled}
                  aria-disabled={resendDisabled}
                  className={`bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50 ${style.resend}`}
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("resend")}
                </button>
              </div>
            </div>

            <StatusLine
              sending={sending}
              verifying={verifying}
              className={style.verifying}
              sendingLabel={t("sending")}
              verifyingLabel={t("verifying")}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The one place the screen says what it is busy doing. Asking for a code and
 * checking one are different errands, and only the second may say "Verifying".
 */
function StatusLine({
  sending,
  verifying,
  className,
  sendingLabel,
  verifyingLabel,
}: {
  sending: boolean;
  verifying: boolean;
  className: string;
  sendingLabel: string;
  verifyingLabel: string;
}) {
  if (!sending && !verifying) return null;
  return (
    <p
      className={`text-brand text-center ${className}`}
      style={{ fontFamily: "var(--font-inter)" }}
      role="status"
      aria-live="polite"
      data-testid={verifying ? "otp-verifying" : "otp-sending"}
    >
      {verifying ? verifyingLabel : sendingLabel}
    </p>
  );
}
