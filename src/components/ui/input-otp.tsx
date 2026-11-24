"use client";

import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";

import { cn } from "@/lib/utils";

function InputOTP({
  className,
  containerClassName,
  ref,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}) {
  return (
    <OTPInput
      ref={ref}
      data-slot="input-otp"
      containerClassName={cn("flex items-center gap-2 has-disabled:opacity-50", containerClassName)}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number;
}) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        // the cell being typed into is the only one that changes colour — input-otp
        // flips data-active as the caret moves, so the focused state hangs off that
        // rather than off a second piece of state
        "relative flex items-center justify-center text-[#a0a0a0] outline-none transition-colors",
        "data-[active=true]:text-brand group-data-[error=true]:text-[#ef4444]",
        className
      )}
      {...props}
    >
      {/* the digit, or the design's dash for an empty slot. Entered digits are
          centred in the box (Figma 2170:3261); the dashes sit 12px lower, where
          the default frame draws them (2168:3147). */}
      <span className={`leading-none ${char ? "" : "translate-y-[12px]"}`}>{char ?? "—"}</span>
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot };
