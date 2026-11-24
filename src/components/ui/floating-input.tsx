"use client";

import type { RefObject } from "react";
import { useState } from "react";

interface FloatingInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  errorTone?: "brand" | "critical";
  showErrorBorder?: boolean;
  validate?: (value: string) => string | undefined;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  inputRef?: RefObject<HTMLInputElement | null>;
  reserveErrorSpace?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  focusBorderColor?: string;
  focusBorderWidth?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  compactLabelUppercase?: boolean;
  /**
   * `compact` is the person-field treatment the design file draws for Add/Edit
   * person (2459:13897, 2459:14068, 2459:14142): a 64px box that shows only its
   * placeholder while empty, then lifts the label into a small uppercase line
   * above the value once the field is filled. The value never moves between the
   * two states, so nothing reflows as the user types.
   *
   * `default` is every other field in the app and is unchanged.
   */
  variant?: "default" | "compact";
}

// Figma 2459:14142 — the filled person field: an #E5E5EA hairline at radius 12,
// a 11/600 uppercase #A0A0A0 label on 0.5 tracking, and the value beneath it in
// 15/500 #1C1C1E. Errors swap the edge and the message to #FF3B30.
const COMPACT = {
  box: "h-[64px]",
  label: "top-[8px] text-[11px] font-semibold uppercase leading-[13px] tracking-[0.5px] text-[#a0a0a0]",
  input: "relative -top-[1px] pt-[24px] pb-[8px] text-[15px] font-medium leading-[19.36px] text-[#1c1c1e]",
  errorBorder: "border-[#ff3b30]",
  errorText: "text-[12px] font-medium text-[#ff3b30]",
} as const;

export function FloatingInput({
  id,
  label,
  value,
  onChange,
  error,
  errorTone = "brand",
  showErrorBorder = false,
  validate,
  placeholder,
  type = "text",
  inputMode,
  inputRef,
  reserveErrorSpace = true,
  readOnly = false,
  disabled = false,
  focusBorderColor = "#111",
  focusBorderWidth = "1px",
  onFocus,
  onBlur,
  compactLabelUppercase = true,
  variant = "default",
}: FloatingInputProps) {
  const [validationError, setValidationError] = useState<string>("");
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value !== "";
  const isCompact = variant === "compact";
  // The compact field should float on focus (like a standard floating input)
  // and remain floated once it has a value.
  // Elsewhere, a field with its own example text keeps the label visible so both
  // are readable.
  const showLabel = isCompact ? hasValue || isFocused : hasValue || placeholder !== undefined;
  const compactLabelClass = compactLabelUppercase ? COMPACT.label : COMPACT.label.replace(" uppercase", "");

  const displayError = error || validationError;
  const hasErrorVisual = Boolean(displayError) || showErrorBorder;
  const isNonEditable = disabled || readOnly;
  // 2459:14068 writes the person-field message in 12/500 #FF3B30, 4px under the box
  const errorColorClass = isCompact
    ? COMPACT.errorText
    : errorTone === "critical"
      ? "text-[#ef4444]"
      : "text-[#cc007e]";

  const handleChange = (v: string) => {
    if (validationError) setValidationError("");
    onChange(v);
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
    if (validate && value.trim()) {
      setValidationError(validate(value) ?? "");
    }
  };

  return (
    <div className="flex flex-col">
      <div
        className={`group relative w-full rounded-[12px] ${isCompact ? COMPACT.box : "h-[66px]"} ${isNonEditable ? "bg-[#f2f4f7]" : "bg-white"}`}
      >
        {/* border lives on an overlay so it doesn't eat into the content box */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 rounded-[12px] border transition-colors ${displayError ? (isCompact ? COMPACT.errorBorder : "border-[#ef4444]") : isNonEditable ? "border-[#d0d5dd]" : "border-[#e5e5ea] group-focus-within:border-[#cc007e]"}`}
          style={
            !hasErrorVisual && !isNonEditable
              ? {
                  borderColor: isFocused ? focusBorderColor : undefined,
                  borderWidth: isFocused ? focusBorderWidth : undefined,
                }
              : undefined
          }
        />
        {showLabel && (
          <span
            className={`pointer-events-none absolute left-4 ${
              isCompact
                ? compactLabelClass
                : placeholder
                  ? "top-[13px] text-[12px] font-bold uppercase text-[#000]"
                  : "top-[8px] text-[14px] font-normal text-[#a0a0a0]"
            }`}
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {label}
          </span>
        )}
        <input
          ref={inputRef}
          id={id}
          type={type}
          inputMode={inputMode}
          readOnly={readOnly}
          disabled={disabled}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onBlur={handleBlur}
          placeholder={isCompact && showLabel ? "" : (placeholder ?? label)}
          aria-invalid={!!displayError}
          aria-describedby={`${id}-error`}
          style={{ fontFamily: "var(--font-inter)" }}
          className={`h-full w-full bg-transparent outline-none px-4 placeholder:text-[#a0a0a0] placeholder:font-normal disabled:cursor-not-allowed disabled:text-[#737373] [&:-webkit-autofill]:[-webkit-text-fill-color:#111] [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s] [&:-webkit-autofill]:[box-shadow:0_0_0px_1000px_white_inset] ${
            isCompact ? COMPACT.input : `text-[16px] font-normal text-[#111] ${showLabel ? "pt-[24px] pb-[6px]" : ""}`
          }`}
        />
      </div>
      {reserveErrorSpace ? (
        // reserved slot prevents layout shift on error
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          className={`h-[20px] mt-[4px] px-1 text-[12px] ${errorColorClass}`}
        >
          {displayError}
        </p>
      ) : displayError ? (
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          className={`mt-[4px] px-1 text-[12px] ${errorColorClass}`}
        >
          {displayError}
        </p>
      ) : null}
    </div>
  );
}
