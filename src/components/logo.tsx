import Image from "next/image";

interface LogoProps {
  variant?: "wordmark" | "wordmarkCompact" | "icon";
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
}

// intrinsic* is the asset's own pixel size. It is what lets a caller ask for one
// dimension and get the other without distorting the mark — black-logo.webp is
// 462x74, so the long-standing 154x25 default squashes it by about 1.3%.
const SOURCES = {
  wordmark: { src: "/assets/logo/black-logo.webp", width: 154, height: 25, intrinsicWidth: 462, intrinsicHeight: 74 },
  // The lockup the design file itself uses (Figma 1933:2133). Same wordmark as
  // "wordmark", but its smiley is far smaller relative to the text, so the whole
  // mark is much flatter: 9.40 against 6.24. That ratio is fixed inside the
  // artwork, so no rendered size of the other file can stand in for it.
  wordmarkCompact: {
    src: "/assets/logo/black-logo-compact.webp",
    width: 148,
    height: 15.75,
    intrinsicWidth: 592,
    intrinsicHeight: 63,
  },
  icon: { src: "/assets/logo/favicon.svg", width: 88, height: 88, intrinsicWidth: 88, intrinsicHeight: 88 },
};

export function Logo({ variant = "wordmark", width, height, priority, className }: LogoProps) {
  const defaults = SOURCES[variant];
  const aspectRatio = defaults.intrinsicWidth / defaults.intrinsicHeight;

  // Given one dimension, derive the other from the asset rather than a second
  // fixed number. Callers passing both, or neither, keep exactly what they had.
  let resolvedWidth: number;
  let resolvedHeight: number;
  if (width !== undefined && height !== undefined) {
    resolvedWidth = width;
    resolvedHeight = height;
  } else if (height !== undefined) {
    resolvedHeight = height;
    resolvedWidth = height * aspectRatio;
  } else if (width !== undefined) {
    resolvedWidth = width;
    resolvedHeight = width / aspectRatio;
  } else {
    resolvedWidth = defaults.width;
    resolvedHeight = defaults.height;
  }

  return (
    <Image
      src={defaults.src}
      alt="HelpAfterAccident"
      width={Math.round(resolvedWidth)}
      height={Math.round(resolvedHeight)}
      priority={priority}
      unoptimized
      className={className}
      // Tailwind's Preflight sets img { height: auto }, which fights next/image's own height — pin both explicitly
      style={{ width: resolvedWidth, height: resolvedHeight }}
    />
  );
}
