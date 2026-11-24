"use client";

interface ScreenFooterProps {
  // Left out, the footer shows no primary button — for a screen whose way
  // forward only exists once something has happened on it.
  label?: string;
  onClick?: () => void;
  formId?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  secondaryLabel?: string;
  onSecondaryClick?: () => void;
  secondaryVariant?: "link" | "button";
  secondaryDisabled?: boolean;
  secondaryLinkPlacement?: "bottom" | "top";
  secondaryLinkAlign?: "center" | "right";
  reserveSecondaryLinkSpace?: boolean;
  topPaddingClassName?: string;
  paddingBottomOverride?: string;
}

export function ScreenFooter({
  label,
  onClick,
  formId,
  disabled = false,
  loading = false,
  error,
  secondaryLabel,
  onSecondaryClick,
  secondaryVariant = "link",
  secondaryDisabled = false,
  secondaryLinkPlacement = "bottom",
  secondaryLinkAlign = "center",
  reserveSecondaryLinkSpace = false,
  topPaddingClassName = "pt-[24px]",
  paddingBottomOverride,
}: ScreenFooterProps) {
  const isDisabled = disabled || loading;
  const isLink = secondaryVariant === "link";
  const showReservedSecondarySlot = reserveSecondaryLinkSpace && isLink && !secondaryLabel;
  const rowGap = (secondaryLabel && isLink) || showReservedSecondarySlot ? "12px" : "8px";
  const footerStyle = {
    rowGap,
    paddingBottom:
      paddingBottomOverride ??
      ((secondaryLabel && isLink) || showReservedSecondarySlot
        ? "calc(env(safe-area-inset-bottom) + 4px)"
        : "calc(env(safe-area-inset-bottom) + 12px)"),
  };

  return (
    <div
      className={`sticky bottom-0 z-30 w-full shrink-0 bg-white px-[24px] ${topPaddingClassName} flex flex-col md:px-[28px]`}
      style={footerStyle}
    >
      {error && <p className="text-[12px] text-[#cc007e] text-center">{error}</p>}
      {label !== undefined && (
        <button
          type={formId ? "submit" : "button"}
          form={formId}
          onClick={onClick}
          disabled={isDisabled}
          className={`w-full h-[56px] rounded-[16px] text-[16px] font-semibold ${
            isDisabled ? "bg-[#e5e5e5] text-[#8c8c8c] cursor-not-allowed" : "bg-brand text-white"
          }`}
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {label}
        </button>
      )}
      {secondaryLabel && isLink && (
        <button
          type="button"
          onClick={onSecondaryClick}
          disabled={secondaryDisabled}
          className={`w-full h-[44px] flex ${secondaryLinkAlign === "right" ? "justify-end pr-[2px]" : "justify-center"} text-[14px] font-semibold leading-[15px] underline ${
            secondaryLinkPlacement === "bottom" ? "items-end pb-[6px]" : "items-start"
          } ${secondaryDisabled ? "text-[#a0a0a0] cursor-not-allowed" : "text-[#6e6e73]"}`}
          // the design system's Link (Figma 44:9771): Nunito Sans SemiBold 14 on a 15px line
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {secondaryLabel}
        </button>
      )}
      {showReservedSecondarySlot && (
        <div
          aria-hidden="true"
          className="w-full h-[44px]"
        />
      )}
      {secondaryLabel && !isLink && (
        <button
          type="button"
          onClick={onSecondaryClick}
          disabled={secondaryDisabled}
          className={`w-full h-[56px] rounded-[16px] border text-[16px] font-semibold ${
            secondaryDisabled
              ? "border-[#e5e5e5] bg-white text-black opacity-40 cursor-not-allowed"
              : "border-[#e5e5e5] bg-white text-black"
          }`}
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}
