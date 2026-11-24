"use client";

import { Logo } from "@/components/logo";
import { LOCALE_CODES, LOCALES } from "@/i18n/locales";
import { clearAmbassadorSession } from "@/lib/ambassador-session";
import { appFlowForPath } from "@/lib/app-flow";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";
import { clearIntakeSession, preserveIntakeResumeDraft } from "@/lib/intake-session";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface ScreenHeaderProps {
  showLanguageSelector?: boolean;
  showCallButton?: boolean;
  // Ambassador screens hide Call by default; opt in only on screens that
  // intentionally show it (e.g. ambassador dashboard).
  allowCallButtonInAmbassadorFlow?: boolean;
  // Browser history, so it never invents a destination. The Patient Flow does
  // not offer it.
  showBack?: boolean;
  // The patient dashboard's header as Figma 5783:5481 draws it: the logo 20px
  // in, Call in Inter SemiBold 14, and the language as "EN ⌄" 12px after it in
  // place of the menu — so no Home, Log out or Ambassadors here. Every other
  // screen keeps the menu.
  languagePicker?: boolean;
}

export function ScreenHeader({
  showCallButton = true,
  allowCallButtonInAmbassadorFlow = false,
  showBack = false,
  languagePicker = false,
}: ScreenHeaderProps) {
  const MENU_REOPEN_FLAG = "screen-header:reopen-menu";
  const t = useTranslations("ScreenHeader");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const localeLabelMap = Object.fromEntries(LOCALES.map(({ code, label }) => [code, label]));
  const currentLocaleLabel = localeLabelMap[locale] ?? locale.toUpperCase();
  const localePrefix = `/${locale}`;
  const isAmbassadorFlow = appFlowForPath(pathname) === "ambassador";
  const authEntryHref = isAmbassadorFlow ? `${localePrefix}/ambassadors/login` : `${localePrefix}/patient/login`;
  const shouldShowCallButton = showCallButton && (!isAmbassadorFlow || allowCallButtonInAmbassadorFlow);
  const homeHref = isAmbassadorFlow
    ? `${localePrefix}/ambassadors/dashboard`
    : pathname.startsWith(`${localePrefix}/intake`)
      ? `${localePrefix}/intake/dashboard`
      : localePrefix;

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setLanguageOpen(false);
      }
    };

    // iOS Safari can be inconsistent with pointer events in some contexts,
    // so rely on touchstart + mousedown for outside-click dismissal.
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(MENU_REOPEN_FLAG) !== "1") return;
    sessionStorage.removeItem(MENU_REOPEN_FLAG);
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(session));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSelect = (code: string, reopenMenu = true) => {
    setLanguageOpen(false);
    if (code === locale) return;

    const pathname = window.location.pathname;
    const segments = pathname.split("/");

    let nextPath = pathname;
    if (segments[1] === locale) {
      segments[1] = code;
      nextPath = segments.join("/") || `/${code}`;
    } else if (pathname === `/${locale}`) {
      nextPath = `/${code}`;
    } else {
      nextPath = `/${code}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    }

    if (reopenMenu) sessionStorage.setItem(MENU_REOPEN_FLAG, "1");
    router.push(`${nextPath}${window.location.search}${window.location.hash}`);
  };

  const clearSupabaseAuthCookies = () => {
    const cookieNames = document.cookie
      .split(";")
      .map((cookie) => cookie.trim().split("=")[0])
      .filter((name) => name.startsWith("sb-") && name.includes("-auth-token"));

    for (const name of cookieNames) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; Path=/`;
    }
  };

  const clearSupabaseAuthStorage = () => {
    try {
      const localKeys = Object.keys(window.localStorage);
      for (const key of localKeys) {
        if (key.startsWith("sb-") && key.includes("-auth-token")) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // best-effort cleanup
    }

    try {
      const sessionKeys = Object.keys(window.sessionStorage);
      for (const key of sessionKeys) {
        if (key.startsWith("sb-") && key.includes("-auth-token")) {
          window.sessionStorage.removeItem(key);
        }
      }
    } catch {
      // best-effort cleanup
    }
  };

  const clearAppSessionStorage = () => {
    try {
      clearAmbassadorSession(window.sessionStorage);
      preserveIntakeResumeDraft(window.sessionStorage);
      clearIntakeSession(window.sessionStorage);
    } catch {
      // best-effort cleanup
    }
  };

  const handleAuthAction = async () => {
    if (!isAuthenticated) {
      router.push(authEntryHref);
      return;
    }

    const supabase = createClient();
    try {
      // Use server-backed sign-out so the session is revoked, not only cleared locally.
      await supabase.auth.signOut();
    } catch {
      // We still verify and clean local auth artifacts below.
    }

    clearSupabaseAuthCookies();
    clearSupabaseAuthStorage();
    clearAppSessionStorage();

    let stillSignedIn = true;
    try {
      const { data } = await supabase.auth.getSession();
      stillSignedIn = Boolean(data.session);
    } catch {
      stillSignedIn = true;
    }

    if (stillSignedIn) {
      return;
    }

    setIsAuthenticated(false);
    window.location.replace(authEntryHref);
  };

  return (
    <div
      ref={ref}
      className={`sticky top-0 z-[60] bg-white pt-[20px] pb-[28px] md:px-[28px] ${languagePicker ? "px-[20px]" : "px-[24px]"}`}
    >
      {/* Every frame draws this as a 32px row (pt 20 / pb 28, 80px in all); the
          44px menu target overflows it vertically rather than stretching it,
          which is what kept the logo 6px below the design's 28px */}
      {/* 5783:5481 sets the right-hand group 96px after the logo, 10px short of
          the row's edge, on its 393px frame. The group goes to the edge less
          those 10px, so the frame comes out exactly at 393 and the group stays
          on the right at every other width; from md up it is flush. */}
      <div className="flex min-h-[32px] items-center justify-between">
        <div className="flex items-center gap-[12px]">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label={t("back")}
              className="-ml-[4px] flex size-[24px] items-center justify-center"
            >
              <svg
                width="10"
                height="18"
                viewBox="0 0 10 18"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 1L1 9L9 17"
                  stroke="#111"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {/* The logo is the start of the flow the screen belongs to: the
              patient landing, or the ambassador's, which sends a signed-in
              ambassador on to their dashboard. */}
          <Link
            href={isAmbassadorFlow ? `${localePrefix}/ambassadors` : `/${locale}`}
            aria-label={t("homeLabel")}
          >
            {/* Figma 1933:2133 paints the mark 148x15.75 inside its 148x22 box.
              Only the design file's own lockup reproduces that — see the
              wordmarkCompact note in logo.tsx. */}
            <Logo
              priority
              variant="wordmarkCompact"
            />
          </Link>
        </div>

        <div
          className={`relative flex items-center justify-end gap-[12px] ${languagePicker ? "mr-[10px] md:mr-0" : ""}`}
        >
          {shouldShowCallButton && (
            <a
              href={SUPPORT_PHONE_TEL}
              // 5783:5481's pill is 54px around "Call"; the browser sets Inter
              // SemiBold 2px wider than Figma, so its sides are 13px, not 14
              className={`flex h-[32px] items-center justify-center gap-[4px] rounded-[16px] border border-[#CC007E] text-[#111] ${
                languagePicker
                  ? "px-[13px] text-[14px] font-semibold leading-normal"
                  : "px-[14px] text-[15px] font-normal leading-[20px]"
              }`}
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("call")}
            </a>
          )}

          {languagePicker ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setLanguageOpen((v) => !v)}
                aria-expanded={languageOpen}
                aria-controls="screen-header-language"
                aria-label={`${t("language")}: ${currentLocaleLabel}`}
                className="flex items-center gap-[4px] text-[14px] font-medium leading-normal text-[#6e6e73]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {locale.toUpperCase()}
                {/* the frame's own chevron (5783:7070) */}
                <svg
                  width="11.5"
                  height="7.922"
                  viewBox="0 0 11.5 7.92156"
                  fill="none"
                  aria-hidden="true"
                  className={`-mx-[0.75px] transition-transform ${languageOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M0.750019 0.750019L5.75002 6.75002L10.75 0.750019"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {languageOpen && (
                <div
                  id="screen-header-language"
                  className="absolute right-0 top-[calc(100%+10px)] z-[70] min-w-[160px] overflow-hidden rounded-[10px] border border-[#e4e6eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
                >
                  {LOCALE_CODES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleSelect(code, false)}
                      aria-current={code === locale ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-[24px] px-[12px] py-[10px] text-left text-[15px] hover:bg-[#f9f9f9] ${
                        code === locale ? "font-semibold text-[#cc007e]" : "font-normal text-[#111]"
                      }`}
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      {localeLabelMap[code] ?? code.toUpperCase()}
                      {code === locale && (
                        <svg
                          width="14"
                          height="10"
                          viewBox="0 0 14 10"
                          fill="none"
                          aria-hidden="true"
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
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  setMenuOpen((v) => !v);
                }}
                aria-expanded={menuOpen}
                aria-controls="screen-header-menu"
                aria-label="Open menu"
                className="-my-[6px] inline-flex size-[44px] touch-manipulation items-center justify-center rounded-[10px] text-[#111111]"
              >
                <span
                  className="grid gap-[4px]"
                  aria-hidden="true"
                >
                  <span className="block h-[2px] w-[18px] rounded-full bg-black" />
                  <span className="block h-[2px] w-[18px] rounded-full bg-black" />
                </span>
              </button>

              {menuOpen && (
                <nav
                  id="screen-header-menu"
                  aria-label="Screen menu"
                  className="absolute right-0 top-[calc(100%+10px)] z-[70] w-[260px] rounded-[12px] border border-[#e4e6eb] bg-white p-[12px] shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute -top-[8px] right-[18px] h-[14px] w-[14px] rotate-45 border-l border-t border-[#e4e6eb] bg-white"
                  />

                  {isAuthenticated && (
                    <>
                      <Link
                        href={homeHref}
                        onClick={() => {
                          setLanguageOpen(false);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-[8px] px-[10px] py-[10px] text-left hover:bg-[#fafafa]"
                      >
                        <span
                          className="text-[15px] font-normal leading-[20px] text-[#111]"
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          Home
                        </span>
                      </Link>

                      <div className="my-[8px] h-px w-full bg-[#eceef3]" />
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setLanguageOpen(false);
                      setMenuOpen(false);
                      void handleAuthAction();
                    }}
                    className="flex w-full items-center justify-between rounded-[8px] px-[10px] py-[10px] text-left hover:bg-[#fafafa]"
                  >
                    <span
                      className="text-[15px] font-normal leading-[20px] text-[#111]"
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      {isAuthenticated ? t("logOut") : t("logIn")}
                    </span>
                  </button>

                  <div className="my-[8px] h-px w-full bg-[#eceef3]" />

                  <Link
                    href={`${localePrefix}/ambassadors`}
                    onClick={() => {
                      setLanguageOpen(false);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-[8px] px-[10px] py-[10px] text-left hover:bg-[#fafafa]"
                  >
                    <span
                      className="text-[15px] font-normal leading-[20px] text-[#111]"
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      Ambassadors
                    </span>
                  </Link>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setLanguageOpen((v) => !v)}
                      className="flex w-full items-center justify-between gap-[8px] rounded-[8px] px-[10px] py-[10px] text-left hover:bg-[#fafafa]"
                    >
                      <span className="flex items-center gap-[6px]">
                        <span
                          className="text-[15px] font-normal leading-[20px] text-[#111]"
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          Language
                        </span>
                        <span
                          className="text-[15px] font-normal leading-[20px] text-[#6e6e73]"
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          •
                        </span>
                        <span
                          className="text-[15px] font-semibold leading-[20px] text-[#cc007e]"
                          style={{ fontFamily: "var(--font-inter)" }}
                        >
                          {currentLocaleLabel}
                        </span>
                      </span>
                      <span className="flex items-center text-[#6e6e73]">
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${languageOpen ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>
                    {languageOpen && (
                      <div className="mt-[6px] overflow-hidden rounded-[10px] border border-[#e4e6eb] bg-white">
                        {LOCALE_CODES.map((code) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => handleSelect(code)}
                            className={`flex w-full items-center justify-between gap-[24px] px-[12px] py-[10px] text-left text-[15px] hover:bg-[#f9f9f9] ${
                              code === locale ? "font-semibold text-[#cc007e]" : "font-normal text-[#111]"
                            }`}
                          >
                            {localeLabelMap[code] ?? code.toUpperCase()}
                            {code === locale && (
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
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
