"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const LOCALES = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

export function IntakeHeader() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (code: string) => {
    setOpen(false);
    if (code === locale) return;
    const path = window.location.pathname.replace(`/${locale}/`, `/${code}/`);
    router.push(path);
  };

  return (
    <div className="flex justify-between items-center px-[24px] pt-[68px] pb-[20px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/logo/black-logo.png"
        alt="HelpAfterAccident"
        width={154}
        height={22}
      />
      <div
        ref={ref}
        className="relative"
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-[4px]"
        >
          <span className="text-[#6e6e73] text-[16px] font-normal">{locale.toUpperCase()}</span>
          <svg
            width="9"
            height="6"
            viewBox="0 0 9.5 6.95"
            fill="none"
          >
            <path
              d="M1 1L4.75 5.45L8.5 1"
              stroke="#6E6E73"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-[calc(100%+8px)] bg-white border border-[rgba(33,36,38,0.10)] rounded-[10px] shadow-sm overflow-hidden z-50">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => handleSelect(l.code)}
                className={`flex items-center justify-between gap-[24px] px-[16px] py-[10px] text-[15px] w-full text-left hover:bg-[#f9f9f9] ${
                  l.code === locale ? "text-[#cc007e] font-semibold" : "text-[#111] font-normal"
                }`}
              >
                {l.label}
                {l.code === locale && (
                  <svg
                    width="14"
                    height="10"
                    viewBox="0 0 14 10"
                    fill="none"
                  >
                    <path
                      d="M1 5L5 9L13 1"
                      stroke="#cc007e"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
