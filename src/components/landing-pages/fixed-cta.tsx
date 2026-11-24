"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FixedCtaProps = {
  href: string;
  label: string;
  hideBeforeSelector?: string;
};

export function FixedCta({ href, label, hideBeforeSelector = "footer" }: FixedCtaProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      const scrollTop = window.scrollY;
      const viewportHeight = window.innerHeight;
      const isPastFirstViewport = scrollTop >= viewportHeight;
      const hideTarget = document.querySelector(hideBeforeSelector);
      const isNearHideTarget =
        hideTarget instanceof HTMLElement ? hideTarget.getBoundingClientRect().top < viewportHeight + 100 : false;

      setIsVisible(isPastFirstViewport && !isNearHideTarget);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [hideBeforeSelector]);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 bg-white/95 px-5 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur transition-transform duration-200 ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1680px] justify-start">
        <Link
          className="font-nunito inline-flex min-h-[56px] min-w-[240px] items-center justify-center rounded-[16px] bg-[#cc007e] px-[22px] text-[18px] font-[700] text-white max-[520px]:w-full max-[520px]:min-w-0"
          href={href}
        >
          {label}
        </Link>
      </div>
    </div>
  );
}
