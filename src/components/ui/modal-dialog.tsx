"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  // Rendered as the dialog's heading. Omit for the provider detail popups, which
  // Figma draws with no header at all (4182:5033) — then pass ariaLabel instead.
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
  // The card's own width. Figma: 345 for the share dialogs (4093:14047/14048),
  // 342 for the provider detail popups (4182:5033).
  cardClassName?: string;
  overlayClassName?: string;
  // The share dialogs draw a 1px #E5E7EB edge (4093:14047); the provider detail
  // popups draw none (4182:5033 / 4188:12958). Default keeps the edge.
  bordered?: boolean;
  showCloseButton?: boolean;
}

/**
 * The app's dialog shell. Every overlay before this was a hand-rolled div with no
 * focus trap, no Escape handler and no scroll lock; this is the one place that
 * behaviour lives now.
 *
 * Scrim and card geometry come from Figma 4093:14047 — a white 84% scrim, a 24px
 * radius card with a 1px #E5E7EB border and a 0 8px 24px shadow.
 */
export function ModalDialog({
  open,
  onClose,
  title,
  ariaLabel,
  children,
  cardClassName = "max-w-[345px]",
  overlayClassName = "bg-[rgba(255,255,255,0.84)]",
  bordered = true,
  showCloseButton = true,
}: ModalDialogProps) {
  const tc = useTranslations("Common");
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Escape closes, and Tab stays inside the card.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;

      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    // Scroll lock. Restores the caller's own value rather than clearing it, so it
    // composes with the screens that set overflow themselves.
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // Move focus into the dialog, but onto the card itself rather than its first
    // control — focusing a visually hidden close button makes it paint.
    const focusTimer = window.setTimeout(() => {
      cardRef.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-[24px] ${overlayClassName}`}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        onClick={(event) => event.stopPropagation()}
        className={`w-full rounded-[24px] ${bordered ? "border border-[#E5E7EB]" : ""} bg-white shadow-[0_8px_24px_0_rgba(0,0,0,0.10)] outline-none ${cardClassName}`}
      >
        {/* A headerless popup still needs a reachable close for keyboard and
            screen-reader users; Figma draws no control, so it stays visually hidden. */}
        {!title && (
          <button
            type="button"
            onClick={onClose}
            className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:m-[8px] focus-visible:rounded-[8px] focus-visible:bg-white focus-visible:px-[12px] focus-visible:py-[6px] focus-visible:text-[14px] focus-visible:ring-2 focus-visible:ring-[#cc007e]"
          >
            {tc("close")}
          </button>
        )}
        {title && (
          <div className={`px-[24px] pt-[24px] ${showCloseButton ? "flex items-center justify-between" : "block"}`}>
            <h2
              id={titleId}
              className="text-[20px] font-extrabold leading-[27.28px] text-[#111828]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {title}
            </h2>
            {showCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label={tc("close")}
                className="flex size-[24px] shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6.67"
                    stroke="#4B5563"
                    strokeWidth="2"
                  />
                  <path
                    d="M10 6L6 10M6 6l4 4"
                    stroke="#4B5563"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:m-[8px] focus-visible:rounded-[8px] focus-visible:bg-white focus-visible:px-[12px] focus-visible:py-[6px] focus-visible:text-[14px] focus-visible:ring-2 focus-visible:ring-[#cc007e]"
              >
                {tc("close")}
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
