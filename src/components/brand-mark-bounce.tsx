import type { ReactNode } from "react";

interface BrandMarkBounceProps {
  children: ReactNode;
}

/**
 * The brand mark's bounce on the buttonless interstitials: `haa-bounce` in
 * tailwind.config.ts, a 12px rise that settles and rests on a 2 s loop.
 *
 * Patient Flow and Brand Ambassador screens wrap their mark in this instead of
 * repeating the classes, so the motion and its reduced-motion opt-out are
 * defined once. It moves the wrapper rather than the image, so a mark drawn
 * inside a clipped or rounded box travels with the box instead of being cut off.
 */
export function BrandMarkBounce({ children }: BrandMarkBounceProps) {
  return <div className="animate-haa-bounce motion-reduce:animate-none">{children}</div>;
}
