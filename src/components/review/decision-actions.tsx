"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Clock } from "lucide-react";
import posthog from "posthog-js";

type ReviewAction = "reject_case" | "accept_case";
type ReviewStatus = "pending" | "accepted" | "rejected" | "expired";

function formatCountdown(remainingSeconds: number) {
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;

  return days > 0
    ? `${String(days).padStart(2, "0")}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Accept / Reject for the lawyer's review link.
 *
 * The deadline is the backend's decision window. Remaining time is worked out
 * here only to show it, and the buttons lock when it passes; the backend
 * refuses a late decision on its own, so a slow or altered clock can never
 * extend it. After a decision the page is refreshed, because what the lawyer
 * may see is decided by the backend from the new state.
 */
export function DecisionActions({
  canDecide,
  status,
  responseDeadline,
  className,
}: {
  canDecide: boolean;
  status: ReviewStatus;
  responseDeadline: string | null;
  className?: string;
}) {
  const t = useTranslations("LawyerReviewDecision");
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecisionLocked, setIsDecisionLocked] = useState(!canDecide);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error" | "neutral">("neutral");
  const [now, setNow] = useState(() => Date.now());
  const [reminderOpen, setReminderOpen] = useState(false);

  const deadlineMs = responseDeadline ? Date.parse(responseDeadline) : Number.NaN;
  const hasDeadline = !Number.isNaN(deadlineMs);
  const deadlinePassed = hasDeadline && now >= deadlineMs;
  const buttonsDisabled = isSubmitting || isDecisionLocked || deadlinePassed;
  const showDeadline = canDecide && status === "pending" && hasDeadline && !isDecisionLocked && !deadlinePassed;
  const showActiveWindow = canDecide && status === "pending" && !isDecisionLocked && !deadlinePassed;
  const countdown = hasDeadline && !deadlinePassed ? formatCountdown(Math.ceil((deadlineMs - now) / 1000)) : "";

  useEffect(() => {
    if (!hasDeadline) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [hasDeadline, deadlineMs]);

  useEffect(() => {
    if (!showDeadline) {
      setReminderOpen(false);
      return;
    }

    const firstReminder = window.setTimeout(() => setReminderOpen(true), 3000);
    const recurringReminder = window.setInterval(() => setReminderOpen(true), 150_000);
    return () => {
      window.clearTimeout(firstReminder);
      window.clearInterval(recurringReminder);
    };
  }, [showDeadline]);

  useEffect(() => {
    if (!reminderOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReminderOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [reminderOpen]);

  const runAction = async (action: ReviewAction) => {
    if (buttonsDisabled) return;

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/review/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (response.status === 409 && body?.error === "decision_already_submitted") {
        setIsDecisionLocked(true);
        setTone("neutral");
        setMessage(t("alreadySubmitted"));
        router.refresh();
        return;
      }

      if (response.status === 409 && body?.error === "decision_window_expired") {
        setIsDecisionLocked(true);
        setTone("neutral");
        setMessage(t("windowClosed"));
        router.refresh();
        return;
      }

      if (response.status === 401) {
        setIsDecisionLocked(true);
        setTone("neutral");
        setMessage(t("noLongerOpen"));
        router.refresh();
        return;
      }

      if (!response.ok || !body?.ok) {
        setTone("error");
        setMessage(t("saveError"));
        return;
      }

      setIsDecisionLocked(true);
      setTone("success");
      posthog.capture("review_decision_submitted", { decision: action === "accept_case" ? "accepted" : "rejected" });
      setMessage(action === "accept_case" ? t("accepted") : t("rejected"));
      router.refresh();
    } catch {
      setTone("error");
      setMessage(t("saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const shownMessage =
    status === "accepted"
      ? t("accepted")
      : status === "rejected"
        ? t("rejected")
        : status === "expired" || deadlinePassed
          ? t("noDecision")
          : message || (!canDecide ? t("alreadySubmitted") : "");
  return (
    <section
      aria-label={t("decisionTitle")}
      className={`shrink-0 ${className ?? ""}`}
    >
      {showDeadline ? (
        <div
          role="timer"
          aria-label={countdown}
          className="inline-flex h-[38px] items-center justify-center gap-2 rounded-full bg-[#fde4f3] px-3 text-black"
          data-testid="decision-countdown"
        >
          <Clock
            aria-hidden
            className="size-4 shrink-0 stroke-[2.4]"
          />
          <span className="whitespace-nowrap font-nunito text-[18px] font-extrabold leading-none tabular-nums">
            {t("reminderCountdown", { time: countdown })}
          </span>
        </div>
      ) : null}

      {!showActiveWindow ? (
        <div
          role="status"
          data-review-state={status === "pending" && (deadlinePassed || !canDecide) ? "expired" : status}
          className={`py-2 text-xl font-extrabold sm:text-2xl ${
            status === "accepted" ? "text-emerald-800" : status === "rejected" ? "text-neutral-700" : "text-neutral-900"
          }`}
        >
          {shownMessage}
        </div>
      ) : null}

      {showActiveWindow ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
          <div className="mx-auto grid w-full max-w-5xl gap-2">
            <button
              type="button"
              className="inline-flex h-[56px] items-center justify-center rounded-[14px] bg-[#cc007e] px-5 text-base font-extrabold text-white transition hover:bg-[#ad006b] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runAction("accept_case")}
              disabled={buttonsDisabled}
            >
              {t("accept")}
            </button>
            <button
              type="button"
              className="inline-flex h-[56px] items-center justify-center rounded-[14px] border border-neutral-200 bg-white px-5 text-base font-extrabold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runAction("reject_case")}
              disabled={buttonsDisabled}
            >
              {t("decline")}
            </button>
          </div>
          {message && tone === "error" ? (
            <p
              role="alert"
              className="mx-auto mt-2 max-w-5xl text-sm font-semibold text-red-700"
            >
              {message}
            </p>
          ) : null}
        </div>
      ) : null}

      {reminderOpen && showDeadline ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5 py-8 backdrop-blur-md"
          onClick={() => setReminderOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("reminderTitle")}
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-[390px] rounded-[18px] bg-white px-7 pb-9 pt-10 text-center shadow-[0_16px_50px_rgba(0,0,0,0.24)]"
          >
            <Image
              src="/assets/review/HAACircle.png"
              alt=""
              width={275}
              height={180}
              priority
              className="mx-auto h-auto w-[275px]"
            />
            <p className="mt-6 text-center font-nunito text-[28px] font-extrabold leading-[1.04] text-[#cc007e]">
              {t("reminderCountdown", { time: countdown })}
            </p>
            <p className="mt-2 whitespace-pre-line text-center text-[22px] font-bold leading-[1.15] text-[#5c5c5c]">
              {t("acceptBeforeItMoves")}
            </p>
            <div className="mt-7 grid gap-2">
              <button
                type="button"
                className="inline-flex h-[56px] items-center justify-center rounded-[14px] bg-[#cc007e] px-5 text-base font-extrabold text-white transition hover:bg-[#ad006b] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => runAction("accept_case")}
                disabled={buttonsDisabled}
              >
                {t("accept")}
              </button>
              <button
                type="button"
                className="inline-flex h-[56px] items-center justify-center rounded-[14px] border border-neutral-200 bg-white px-5 text-base font-extrabold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => runAction("reject_case")}
                disabled={buttonsDisabled}
              >
                {t("decline")}
              </button>
            </div>
            {message && tone === "error" ? (
              <p
                role="alert"
                className="mt-3 text-left text-sm font-semibold text-red-700"
              >
                {message}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
