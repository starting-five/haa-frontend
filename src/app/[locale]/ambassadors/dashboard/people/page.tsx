"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { formatUSPhone } from "@/components/phone/phone-screen";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Mail, MapPin, Phone, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type PersonRecord = {
  id: string;
  name: string;
  incident: string;
  date: string;
  phone: string;
  email: string;
  location: string;
  statusKey:
    | "statusIntake"
    | "statusSubmitted"
    | "statusAwaitingSignature"
    | "statusAttorney"
    | "statusDoctor"
    | "statusQualified"
    | "statusSigned"
    | "statusTreating"
    | "statusNotQualified";
  leadCreatedAt: string;
};

// v1 entries may carry a retainer still awaiting signature as Signed, so they
// are deleted, never shown while the list refreshes.
const PEOPLE_CACHE_KEY = "ambassador_people_cache_v2";
const LEGACY_PEOPLE_CACHE_KEYS = ["ambassador_people_cache_v1"];

function formatDateLabel(value: string, locale: string): string {
  if (!value) return "";

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export default function AmbassadorDashboardPeoplePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("AmbassadorPeople");

  const [query, setQuery] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<PersonRecord | null>(null);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [peopleSyncError, setPeopleSyncError] = useState(false);

  const toDialablePhone = (value: string) => value.replace(/[^\d+]/g, "");
  const toDisplayPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const usDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    return usDigits.length >= 10 ? formatUSPhone(usDigits.slice(0, 10)) : value;
  };

  const refreshPeople = useCallback(async () => {
    try {
      setPeopleSyncError(false);
      const response = await fetch("/api/ambassadors/people", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        setPeopleSyncError(true);
        setPeopleLoaded(true);
        return;
      }

      const payload = (await response.json().catch(() => null)) as { people?: PersonRecord[] } | null;
      if (!Array.isArray(payload?.people)) {
        setPeople((current) => current);
        setPeopleLoaded(true);
        return;
      }

      if (payload.people.length > 0) {
        setPeople(payload.people);
        try {
          localStorage.setItem(PEOPLE_CACHE_KEY, JSON.stringify(payload.people));
        } catch {
          // Ignore storage failures.
        }
      }
      setPeopleLoaded(true);
    } catch {
      setPeopleSyncError(true);
      setPeopleLoaded(true);
      // Keep existing people if people API is temporarily unavailable.
    }
  }, []);

  const filteredPeople = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return people.filter((person) => {
      if (!normalizedQuery) return true;

      return (
        person.name.toLowerCase().includes(normalizedQuery) ||
        person.incident.toLowerCase().includes(normalizedQuery) ||
        person.location.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [people, query]);

  useEffect(() => {
    try {
      for (const key of LEGACY_PEOPLE_CACHE_KEYS) localStorage.removeItem(key);
      const cachedPeopleRaw = localStorage.getItem(PEOPLE_CACHE_KEY);
      if (cachedPeopleRaw) {
        const parsed = JSON.parse(cachedPeopleRaw) as unknown;
        if (Array.isArray(parsed)) {
          const cachedPeople = parsed.filter(
            (value): value is PersonRecord => typeof value === "object" && value !== null
          );
          if (cachedPeople.length > 0) {
            setPeople(cachedPeople);
            setPeopleLoaded(true);
          }
        }
      }
    } catch {
      // Ignore invalid cache values.
    }

    let isActive = true;
    const supabase = createSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refreshIntervalId: number | null = null;

    const handleWindowFocus = () => {
      void refreshPeople();
    };

    void refreshPeople();

    // Realtime broadcasts can be missed if the tab was backgrounded; keep a
    // low-frequency fallback sync so list and headline recover automatically.
    window.addEventListener("focus", handleWindowFocus);
    refreshIntervalId = window.setInterval(() => {
      void refreshPeople();
    }, 30_000);

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
          void refreshPeople();
        })
        .subscribe();
    })();

    return () => {
      isActive = false;
      window.removeEventListener("focus", handleWindowFocus);
      if (refreshIntervalId !== null) {
        window.clearInterval(refreshIntervalId);
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [refreshPeople]);

  // PEOPLE HELPED is the list, counted. It used to come from a second
  // provider call that could disagree with it — it stopped at the provider's
  // first page, and it counted leads whose intake is not in the database — so
  // the headline could say more or fewer than the rows beneath it.
  const displayedLeadsCount = people.length;

  const leadsCountValue = useMemo(
    () => new Intl.NumberFormat(locale).format(displayedLeadsCount),
    [locale, displayedLeadsCount]
  );

  return (
    <div className="h-dvh flex flex-col items-center bg-white">
      <StatusBarPlaceholder />
      <div className="w-full max-w-[393px]">
        <ScreenHeader showCallButton={false} />
      </div>

      <main className="w-full max-w-[393px] flex-1 overflow-y-auto px-[24px] pb-[20px] pt-[32px]">
        <div>
          <p
            className="text-[52px] font-extrabold leading-[0.95] text-[#cc007e]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {!peopleLoaded ? (
              <span
                aria-label="Loading leads"
                className="inline-block h-[48px] w-[74px] animate-pulse rounded-sm bg-gray-200 align-middle"
              />
            ) : (
              leadsCountValue
            )}
          </p>
          <p
            className="text-[20px] font-semibold leading-[1.1] text-[#6E6E73]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("peopleHelped")}
          </p>
        </div>

        <div className="mt-[35px] rounded-[8px] bg-[#f9fafb] px-[14px] py-[10px]">
          <div className="flex h-[26px] items-center gap-[8px] text-[#6c727c]">
            <Search
              size={16}
              strokeWidth={2.2}
            />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent text-[15px] font-normal leading-none text-[#6E6E73] outline-none placeholder:text-[#6E6E73]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            />
          </div>
        </div>

        <div className="mt-[35px] space-y-[22px]">
          {peopleSyncError ? (
            <p
              className="text-[14px] font-normal leading-[1.2] text-[#b85a00]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("peopleSyncError")}
            </p>
          ) : null}

          {filteredPeople.map((person) => (
            <article
              key={person.id}
              className="py-[2px]"
            >
              <div className="flex items-start justify-between gap-[12px]">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setSelectedPerson(person)}
                    className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2"
                  >
                    <p
                      className="text-[24px] font-bold leading-[1] text-[#1C1C1E]"
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      {person.name}
                    </p>
                  </button>
                  <p
                    className="mt-[8px] text-[16px] font-normal leading-[1.1] text-[#6E6E73]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {person.incident}
                    <span
                      aria-hidden
                      className="mx-[8px] inline-block size-[3px] rounded-full bg-[#6E6E73] align-middle"
                    />
                    {formatDateLabel(person.date, locale)}
                  </p>
                </div>

                <span className="inline-flex shrink-0 self-center translate-y-[1px] rounded-[100px] bg-[#e5e7eb] px-[10px] py-[4px]">
                  <span
                    className="text-[12px] font-medium text-[#cc007e]"
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    {t(person.statusKey)}
                  </span>
                </span>
              </div>
            </article>
          ))}

          {filteredPeople.length === 0 ? (
            <p
              className="py-[18px] text-[16px] font-normal leading-none text-[#6b7078]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {!peopleLoaded ? t("peopleLoading") : query.trim() ? t("empty") : t("emptyNoPeople")}
            </p>
          ) : null}
        </div>
      </main>

      <div className="w-full max-w-[393px]">
        <ScreenFooter
          label={t("goToDashboard")}
          onClick={() => router.push(`/${locale}/ambassadors/dashboard`)}
        />
      </div>

      <ModalDialog
        open={selectedPerson !== null}
        onClose={() => setSelectedPerson(null)}
        ariaLabel={selectedPerson?.name ?? t("heading")}
        cardClassName="max-w-[355px]"
        bordered={false}
      >
        {selectedPerson ? (
          <div className="px-[20px] pt-[28px] pb-[22px]">
            <h2
              className="text-[36px] font-extrabold leading-[0.95] text-[#1C1C1E]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {selectedPerson.name}
            </h2>

            <div className="mt-[20px] rounded-[12px] bg-[#f9fafb] p-[20px]">
              <div className="flex items-center gap-[12px] text-[#1C1C1E]">
                <Phone
                  size={20}
                  strokeWidth={2}
                  className="shrink-0 text-[#6E6E73]"
                  aria-hidden="true"
                />
                <a
                  href={selectedPerson.phone ? `tel:${toDialablePhone(selectedPerson.phone)}` : undefined}
                  className="text-[15px] font-medium leading-[normal]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {selectedPerson.phone ? toDisplayPhone(selectedPerson.phone) : "N/A"}
                </a>
              </div>

              <div className="mt-[16px] flex items-center gap-[12px] text-[#1C1C1E]">
                <Mail
                  size={20}
                  strokeWidth={2}
                  className="shrink-0 text-[#6E6E73]"
                  aria-hidden="true"
                />
                <a
                  href={selectedPerson.email ? `mailto:${selectedPerson.email}` : undefined}
                  className="text-[15px] font-medium leading-[normal]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {selectedPerson.email || "N/A"}
                </a>
              </div>

              <div className="mt-[16px] flex items-center gap-[12px] text-[#1C1C1E]">
                <MapPin
                  size={20}
                  strokeWidth={2}
                  className="shrink-0 text-[#6E6E73]"
                  aria-hidden="true"
                />
                <p
                  className="text-[15px] font-medium leading-[normal]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {selectedPerson.location}
                </p>
              </div>
            </div>

            <div className="mt-[20px]">
              <div className="flex items-center justify-between py-[14px]">
                <p
                  className="text-[15px] font-medium text-[#6e6e73]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("detailsStatus")}
                </p>
                <span className="rounded-[100px] bg-[#e5e7eb] px-[10px] py-[4px]">
                  <span
                    className="text-[12px] font-medium text-[#cc007e]"
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    {t(selectedPerson.statusKey)}
                  </span>
                </span>
              </div>
              <div className="h-px w-full bg-[#E5E7EB]" />

              <div className="flex items-center justify-between py-[14px]">
                <p
                  className="text-[15px] font-medium text-[#6e6e73]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("detailsDateOfIncident")}
                </p>
                <p
                  className="text-[15px] font-semibold text-[#1C1C1E]"
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {formatDateLabel(selectedPerson.date, locale)}
                </p>
              </div>
              <div className="h-px w-full bg-[#E5E7EB]" />

              <div className="flex items-center justify-between py-[14px]">
                <p
                  className="text-[15px] font-medium text-[#6e6e73]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {t("statusIntake")}
                </p>
                <p
                  className="text-[15px] font-semibold text-[#1C1C1E]"
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {formatDateLabel(selectedPerson.leadCreatedAt || selectedPerson.date, locale)}
                </p>
              </div>
              <div className="h-px w-full bg-[#E5E7EB]" />
            </div>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}
