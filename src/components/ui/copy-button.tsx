"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface CopyButtonProps {
  // What lands on the clipboard.
  value: string;
  // What the screen reader announces in the idle state. The copied state reads
  // Common.copied for every instance.
  label: string;
  size?: number;
  className?: string;
  disabled?: boolean;
  // Only the link screen needs one — window.prompt, so the value stays selectable.
  onUnavailable?: (text: string) => void;
}

/**
 * The HAA-link copy control. Swaps the copy glyph for a tick, holds it briefly
 * and reverts on its own (Figma 2204:6759, 4093:14048).
 */
export function CopyButton({
  value,
  label,
  size = 16,
  className = "",
  disabled = false,
  onUnavailable,
}: CopyButtonProps) {
  const tc = useTranslations("Common");
  const { copied, copy } = useCopyToClipboard({ onUnavailable });

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      disabled={disabled || !value}
      aria-label={copied ? tc("copied") : label}
      className={`inline-flex items-center justify-center text-[#1c1c1e] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2 ${className}`}
    >
      {copied ? (
        <Check
          size={size}
          strokeWidth={2.5}
          className="text-[#cc007e]"
          aria-hidden="true"
        />
      ) : (
        <Copy
          size={size}
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      {/* the icon swap alone is silent to a screen reader, so announce the change */}
      <span
        aria-live="polite"
        className="sr-only"
      >
        {copied ? tc("copied") : ""}
      </span>
    </button>
  );
}
