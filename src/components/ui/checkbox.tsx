"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";

import { cn } from "@/lib/utils";

// The design's checkbox (Figma 3225:5684): a 20px white box with a 2px #D1D5DB
// border and 6px radius that keeps that box when checked and shows a #212529
// tick inside it. The tick is the path from that node, drawn on the same
// 20x20 grid as the box so it lands exactly where the design puts it. It is
// inline SVG rather than an image so the checked state paints in the same
// frame as the click.
const CHECK_PATH =
  "M12.8661 7.21967C13.159 6.92678 13.6339 6.92678 13.9268 7.21967C14.2161 7.50897 14.2196 7.97582 13.9374 8.26947L9.94522 13.2597C9.93946 13.2669 9.9333 13.2738 9.92678 13.2803C9.63388 13.5732 9.15901 13.5732 8.86612 13.2803L6.21967 10.6339C5.92678 10.341 5.92678 9.86612 6.21967 9.57322C6.51256 9.28033 6.98744 9.28033 7.28033 9.57322L9.37385 11.6667L12.8462 7.2421C12.8524 7.23424 12.859 7.22674 12.8661 7.21967Z";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative size-[20px] shrink-0 rounded-[6px] border-2 border-[#d1d5db] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    {/* The path is measured against the outer 20px box, so the indicator spans the border too. */}
    <CheckboxPrimitive.Indicator className="absolute -inset-[2px] flex">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={CHECK_PATH}
          fill="#212529"
        />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
