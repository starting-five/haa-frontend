"use client";

import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Camera, ChevronRight, Pencil, Share } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

// When an answer does not say when to ask again — a failed request, say.
const ANALYTICS_REFRESH_FALLBACK_MS = 30_000;
// Ask just after the route's cached figures turn over, not on the boundary.
const ANALYTICS_REFRESH_MARGIN_MS = 500;
// A provider cooldown can be long; check back at least this often.
const ANALYTICS_REFRESH_MAX_MS = 300_000;

function buildInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || first.toUpperCase() || "A";
}

type GreetingKey = "greetingMorning" | "greetingAfternoon" | "greetingEvening";

function getGreetingKeyByHour(hour: number): GreetingKey {
  if (hour >= 5 && hour < 12) return "greetingMorning";
  if (hour >= 12 && hour < 18) return "greetingAfternoon";
  return "greetingEvening";
}

export default function AmbassadorDashboardPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("AmbassadorDashboard");

  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showCompleteProfileCard, setShowCompleteProfileCard] = useState(true);
  const [greetingKey, setGreetingKey] = useState<GreetingKey>("greetingMorning");
  const [clickCount, setClickCount] = useState<number | null>(null);
  // Set when the figures could not be read and there is nothing earlier to
  // keep showing: the count reads "—" rather than a zero Dub never reported,
  // or a placeholder that looks like it is still loading.
  const [clickCountUnavailable, setClickCountUnavailable] = useState(false);

  useEffect(() => {
    setAvatarDataUrl(sessionStorage.getItem("onboarding_ambassador_avatarDataUrl") ?? "");
    setPreferredName(sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "");
    setFirstName(sessionStorage.getItem("onboarding_ambassador_firstName") ?? "");
    setLastName(sessionStorage.getItem("onboarding_ambassador_lastName") ?? "");

    const storedCity = (sessionStorage.getItem("onboarding_ambassador_city") ?? "").trim();
    const rawRoles = sessionStorage.getItem("onboarding_ambassador_roles") ?? "[]";

    let hasRole = false;
    try {
      const parsed = JSON.parse(rawRoles) as unknown;
      hasRole = Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0].trim().length > 0;
    } catch {
      hasRole = false;
    }

    setShowCompleteProfileCard(!(hasRole && storedCity.length > 0));

    void (async () => {
      try {
        const response = await fetch("/api/ambassadors/profile", { method: "GET" });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          avatarDataUrl?: string | null;
          preferredName?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          city?: string | null;
          roleKey?: string | null;
        } | null;

        const persistedAvatar = payload?.avatarDataUrl ?? "";
        const persistedPreferredName = payload?.preferredName?.trim() ?? "";
        const persistedFirstName = payload?.firstName?.trim() ?? "";
        const persistedLastName = payload?.lastName?.trim() ?? "";
        const persistedCity = payload?.city?.trim() ?? "";
        const persistedRoleKey = payload?.roleKey?.trim() ?? "";

        if (persistedAvatar) {
          setAvatarDataUrl(persistedAvatar);
          sessionStorage.setItem("onboarding_ambassador_avatarDataUrl", persistedAvatar);
        }
        if (persistedPreferredName) {
          setPreferredName(persistedPreferredName);
          sessionStorage.setItem("onboarding_ambassador_preferredName", persistedPreferredName);
        }
        if (persistedFirstName) {
          setFirstName(persistedFirstName);
          sessionStorage.setItem("onboarding_ambassador_firstName", persistedFirstName);
        }
        if (persistedLastName) {
          setLastName(persistedLastName);
          sessionStorage.setItem("onboarding_ambassador_lastName", persistedLastName);
        }
        if (persistedCity) {
          sessionStorage.setItem("onboarding_ambassador_city", persistedCity);
        }
        if (persistedRoleKey) {
          sessionStorage.setItem("onboarding_ambassador_roles", JSON.stringify([persistedRoleKey]));
        }

        setShowCompleteProfileCard(!(persistedRoleKey.length > 0 && persistedCity.length > 0));
      } catch {
        // Keep local session avatar if profile fetch is unavailable.
      }
    })();
  }, []);

  useEffect(() => {
    let isActive = true;
    let refreshTimer: number | null = null;
    let inflight = false;
    const supabase = createSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // The count moves while the dashboard is open — a click, a scan — and nothing
    // pushes it here unless Dub's webhook is set up. So the next request is booked
    // for when the route says it can have anything newer, and made only while the
    // page is on screen; coming back to the page asks at once.
    const scheduleRefresh = (inMs: number) => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      const delay = Math.min(Math.max(inMs, 1000), ANALYTICS_REFRESH_MAX_MS) + ANALYTICS_REFRESH_MARGIN_MS;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (document.visibilityState === "visible") void refreshAnalytics();
      }, delay);
    };

    const refreshAnalytics = async () => {
      if (inflight) return;
      inflight = true;
      let refreshInMs = ANALYTICS_REFRESH_FALLBACK_MS;

      try {
        const response = await fetch("/api/ambassadors/analytics", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          totalClicksAndScans?: number;
          refreshInMs?: number;
        } | null;

        if (typeof payload?.refreshInMs === "number" && Number.isFinite(payload.refreshInMs)) {
          refreshInMs = payload.refreshInMs;
        }
        if (!isActive) return;

        if (!response.ok) {
          setClickCountUnavailable(true);
          return;
        }

        if (typeof payload?.totalClicksAndScans !== "number" || !Number.isFinite(payload.totalClicksAndScans)) {
          setClickCountUnavailable(true);
          return;
        }

        setClickCount(Math.max(0, Math.floor(payload.totalClicksAndScans)));
        setClickCountUnavailable(false);
      } catch {
        // Keep the current value if analytics is temporarily unavailable.
        if (isActive) setClickCountUnavailable(true);
      } finally {
        inflight = false;
        if (isActive) scheduleRefresh(refreshInMs);
      }
    };

    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") void refreshAnalytics();
    };

    void refreshAnalytics();
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isActive || !user) return;

      channel = supabase
        .channel("ambassador-metrics")
        .on("broadcast", { event: "refresh" }, (message) => {
          const payload = (message.payload ?? {}) as { ambassadorUserId?: string };
          if (payload.ambassadorUserId && payload.ambassadorUserId !== user.id) {
            return;
          }
          void refreshAnalytics();
        })
        .subscribe();
    })();

    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    const syncGreeting = () => {
      setGreetingKey(getGreetingKeyByHour(new Date().getHours()));
    };

    syncGreeting();
    const intervalId = window.setInterval(syncGreeting, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const displayName = useMemo(() => {
    const preferred = preferredName.trim();
    if (preferred) return preferred;
    const first = firstName.trim();
    if (first) return first;
    return t("defaultName");
  }, [firstName, preferredName, t]);

  const initials = useMemo(() => buildInitials(firstName, lastName), [firstName, lastName]);

  // The arrow is its own magenta run in the frame, so it is rendered separately —
  // stripped here in case a translation still carries it inline.
  const postStoryLabel = t("postStory").replace(/\s*→\s*$/, "");
  const clickCountValue = useMemo(() => new Intl.NumberFormat(locale).format(clickCount ?? 0), [locale, clickCount]);

  return (
    <div className="h-dvh flex flex-col items-center bg-white">
      <StatusBarPlaceholder />
      <div className="w-full max-w-[393px]">
        <ScreenHeader allowCallButtonInAmbassadorFlow />
      </div>

      <main className="w-full max-w-[393px] flex flex-1 flex-col overflow-y-auto pb-[30px]">
        <section className="px-[24px] pt-[32px]">
          <div className="flex items-start justify-between">
            <div className="w-[188px] shrink-0">
              {/* greeting and name are one text layer in Figma, so the two lines stack with no gap */}
              <p
                className="text-[22px] font-bold leading-[24.2px] text-[#5c5c5c]"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {t(greetingKey)}
              </p>
              <h1
                className="break-words text-[36px] font-extrabold leading-[34.2px] text-[#101828]"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {displayName}
              </h1>

              <div className="mt-[13px]">
                <p
                  className="text-[40px] font-extrabold leading-[54.56px] text-[#cc007e]"
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {clickCount === null && clickCountUnavailable ? (
                    <span data-testid="click-count-unavailable">—</span>
                  ) : clickCount === null ? (
                    <span
                      aria-label="Loading clicks"
                      className="inline-block h-[36px] w-[88px] animate-pulse rounded-sm bg-gray-200 align-middle"
                    />
                  ) : (
                    clickCountValue
                  )}
                </p>
                <p
                  className="mt-[2px] text-[14px] font-bold leading-[16.94px] text-[#5c5c5c]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("metricLabel")}
                </p>
              </div>
            </div>

            {/* the avatar sits 19px below the greeting baseline in the frame */}
            <div className="mt-[19px] flex w-[99px] shrink-0 flex-col items-center">
              <div className="relative h-[99px] w-[99px]">
                <div className="h-[99px] w-[99px] overflow-hidden rounded-full bg-[#c4c4c4]">
                  {avatarDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarDataUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[30px] font-extrabold text-[#6b7280]">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-[8px] right-[13px] flex size-[26px] items-center justify-center rounded-full border-2 border-white bg-[#cc007e] text-white">
                  <Camera
                    size={14}
                    strokeWidth={2}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push(`/${locale}/ambassadors/dashboard/profile/edit`)}
                className="mt-[11px] flex items-center gap-[7px] text-[12px] font-medium leading-[16.2px] text-black"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                <Pencil
                  size={18}
                  strokeWidth={2}
                  className="shrink-0 text-[#cc007e]"
                />
                {t("editProfile")}
              </button>
            </div>
          </div>
        </section>

        {showCompleteProfileCard ? (
          <section className="px-[24px] pt-[30px]">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/ambassadors/dashboard/profile/edit`)}
              // the frame centres the label and chevron as a pair rather than pinning them to the edges
              className="flex w-full items-center justify-center rounded-[16px] bg-[rgba(255,230,245,0.3)] px-[21px] py-[20px] shadow-[0_4px_4px_rgba(0,0,0,0.02)]"
            >
              <span
                className="shrink-0 text-[14px] font-bold leading-[18.9px] text-[#5c5c5c]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("completeProfile")}
              </span>
              {/* the 87px gap the frame shows, but able to close first on a narrow phone
                  so the label never has to wrap */}
              <span
                aria-hidden
                className="h-px max-w-[87px] flex-1"
              />
              <span
                aria-hidden
                className="flex h-[25px] w-[22px] shrink-0 items-center justify-center"
              >
                <ChevronRight
                  size={30}
                  strokeWidth={3}
                  className="shrink-0 text-black"
                />
              </span>
            </button>
          </section>
        ) : null}

        <section className="px-[24px] pt-[26px]">
          <div className="flex items-stretch bg-white">
            <span
              aria-hidden
              className="w-[4px] shrink-0 bg-[#d1d1d6]"
            />
            <div className="flex-1 pl-[16px] pr-[20px]">
              <p
                className="text-[14px] font-extrabold uppercase leading-[16.94px] text-[#8e8e93]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("doThisNext")}
              </p>
              <div
                className="mt-[12px] text-left text-[40px] font-extrabold leading-[44px] text-[#6e6e73]"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {postStoryLabel} <span className="text-[#8e8e93]">&rarr;</span>
              </div>

              <div className="mt-[12px] flex items-center gap-[12px]">
                <p
                  className="text-[14px] font-semibold leading-[16.94px] text-[#8e8e93]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("progressToday")}
                </p>
                <div className="flex items-center gap-[6px]">
                  <span className="h-[6px] w-[16px] rounded-[3px] bg-[#d1d1d6]" />
                  <span className="h-[6px] w-[16px] rounded-[3px] bg-[#d1d1d6]" />
                  <span className="h-[6px] w-[16px] rounded-[3px] bg-[#e5e5ea]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-[24px] pt-[26px]">
          <div className="grid grid-cols-2 gap-[12px]">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/ambassadors/dashboard/share-it`)}
              className="flex h-[144px] flex-col items-center rounded-[16px] bg-white p-[16px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <span className="inline-flex size-[72px] items-center justify-center rounded-[16px] border border-[rgba(255,255,255,0.10)] bg-[linear-gradient(180deg,#4a4a4f_0%,#1a1a1e_100%)] text-white shadow-[0_4px_8px_rgba(0,0,0,0.45),inset_0_2px_4px_rgba(255,255,255,0.18)]">
                <Share
                  size={28}
                  strokeWidth={2}
                />
              </span>
              <p
                className="mt-[12px] text-center text-[16px] font-bold leading-[21.82px] text-[#111827]"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {t("shareHaa")}
              </p>
            </button>

            <button
              type="button"
              onClick={() => router.push(`/${locale}/ambassadors/dashboard/people`)}
              className="flex h-[144px] flex-col items-center rounded-[16px] bg-white p-[16px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <span className="inline-flex h-[72px] w-full items-center justify-center overflow-hidden rounded-[16px]">
                <Image
                  src="/assets/ambassador/dashboard/haa-people.png"
                  alt=""
                  width={100}
                  height={76}
                  className="h-[76px] w-[100px] max-w-none object-contain"
                />
              </span>
              <p
                className="mt-[12px] text-center text-[16px] font-bold leading-[19.36px] text-[#111827]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("peopleList")}
              </p>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
