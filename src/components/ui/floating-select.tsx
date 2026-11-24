"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

interface FloatingSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  error?: string;
  reserveErrorSpace?: boolean;
  // "compact" is the ambassador profile field (Figma 3830:5834): 56px tall, and
  // the chosen role replaces the placeholder instead of floating above it.
  variant?: "floating" | "compact";
}

export function FloatingSelect({
  id,
  label,
  value,
  onChange,
  options,
  error,
  reserveErrorSpace = true,
  variant = "floating",
}: FloatingSelectProps) {
  const [focused, setFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isCompact = variant === "compact";
  const hasValue = value !== "";
  const selectedIndex = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);
  const selectedLabel = selectedIndex >= 0 ? (options[selectedIndex]?.label ?? "") : "";

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setFocused(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : -1);
  }, [isOpen, selectedIndex]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    setFocused(false);
  };

  const handleToggleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setFocused(true);
        return;
      }

      const direction = event.key === "ArrowDown" ? 1 : -1;
      const start = highlightedIndex >= 0 ? highlightedIndex : selectedIndex >= 0 ? selectedIndex : 0;
      const next = (start + direction + options.length) % options.length;
      setHighlightedIndex(next);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && isOpen && highlightedIndex >= 0) {
      event.preventDefault();
      handleSelect(options[highlightedIndex]?.value ?? "");
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setFocused(false);
      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      setFocused(false);
    }
  };

  return (
    <div
      className="flex flex-col"
      ref={wrapperRef}
    >
      <div className={`relative w-full rounded-[12px] bg-white ${isCompact ? "h-[56px]" : "h-[66px]"}`}>
        {/* border lives on an overlay so it doesn't eat into the content box */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 rounded-[12px] border ${error ? "border-[#ef4444]" : focused || isOpen ? "border-[#cc007e]" : "border-[#e5e5ea]"}`}
        />

        <button
          type="button"
          id={id}
          onClick={() => {
            setIsOpen((prev) => !prev);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleToggleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-describedby={`${id}-error`}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent outline-none"
        >
          {/* the compact variant hides the label once a role is picked, so the
              accessible name has to carry both */}
          <span className="sr-only">{selectedLabel ? `${label} ${selectedLabel}` : label}</span>
        </button>

        <div
          className={`pointer-events-none absolute inset-0 flex flex-col ${isCompact ? "px-[18px]" : "px-[16px]"}`}
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {isCompact ? (
            <div className="flex h-full items-center">
              <span
                className={`truncate pr-[24px] text-[16px] font-medium leading-[19.36px] ${hasValue ? "text-[#5c5c5c]" : "text-[#a0a0a0]"}`}
              >
                {hasValue ? selectedLabel : label}
              </span>
            </div>
          ) : hasValue ? (
            <div className="flex flex-col gap-[2px] pt-[8px] pb-[6px]">
              <span className="text-[14px] font-normal text-[#a0a0a0]">{label}</span>
              <span className="text-[16px] font-normal text-[#111]">{selectedLabel}</span>
            </div>
          ) : (
            <div className="flex h-full items-center">
              <span className="text-[16px] font-normal text-[#a0a0a0]">{label}</span>
            </div>
          )}
        </div>

        <ChevronDown
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 transition-transform ${
            isCompact ? "right-[18px] h-[20px] w-[20px] text-[#111]" : "right-4 h-[18px] w-[18px] text-[#a0a0a0]"
          } ${isOpen ? "rotate-180" : "rotate-0"}`}
          strokeWidth={isCompact ? 2.5 : 2}
        />
      </div>

      {isOpen ? (
        // Figma 3830:5831 — 14px radius, 6px inset, 1px #E5E5EA hairline and a
        // barely-there 0 8 24 shadow
        <div className="relative z-20 mt-[8px] rounded-[14px] border border-[#e5e5ea] bg-white p-[6px] shadow-[0_8px_24px_rgba(0,0,0,0.051)]">
          <ul
            role="listbox"
            aria-labelledby={id}
            onMouseLeave={() => setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : -1)}
            className="flex max-h-[350px] flex-col gap-[2px] overflow-y-auto"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <li
                  key={option.value}
                  className="list-none"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelect(option.value)}
                    className={`flex min-h-[42px] w-full items-center rounded-[8px] px-[16px] py-[12px] text-left text-[15px] leading-[18px] transition-colors ${
                      isSelected
                        ? "bg-[#fff0f6] text-[#cc007e] font-bold"
                        : isHighlighted
                          ? "bg-[#f8f9fb] text-[#212426] font-medium"
                          : "bg-transparent text-[#212426] font-medium hover:bg-[#f8f9fb]"
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {reserveErrorSpace ? (
        // reserved slot prevents layout shift on error
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          className="h-[20px] mt-[4px] px-1 text-[12px] text-[#ef4444]"
        >
          {error}
        </p>
      ) : error ? (
        <p
          id={`${id}-error`}
          role="alert"
          aria-live="polite"
          className="mt-[4px] px-1 text-[12px] text-[#ef4444]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
