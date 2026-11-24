"use client";

// Reserve only the actual top safe-area inset instead of a fixed mockup value.
export function StatusBarPlaceholder() {
  return (
    <div
      className="w-full shrink-0"
      style={{ height: "env(safe-area-inset-top, 0px)" }}
    />
  );
}
