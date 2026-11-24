"use client";

import { LayoutList, Mail, MessageSquareText, Phone, Repeat } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import posthog from "posthog-js";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { ProviderDetailsDialog } from "@/components/providers/provider-details-dialog";
import { toTelHref, type Provider } from "@/lib/providers";

interface ProviderScreenProps {
  // "attorney" | "doctor" — selects the copy, nothing else. The two screens are
  // the same layout in Figma (4181:5101 and 4200:12992).
  kind: "attorney" | "doctor";
  provider: Provider;
}

// Figma draws the card stroke INSIDE the frame, so its 48/52px heights already
// contain the border; a CSS border-box adds it on top. Pinning the height keeps
// the five rows on the design's exact rhythm instead of drifting 2px each.
const CARD_BASE =
  "flex w-full items-center justify-between gap-[12px] rounded-[14px] border border-[#E5E7EB] bg-white px-[20px] text-left";
const CARD_CLASS = `${CARD_BASE} h-[48px]`;
const CARD_CLASS_TALL = `${CARD_BASE} h-[52px]`;
const LABEL_CLASS = "text-[16px] font-semibold leading-[15px] text-[#1F2937]";
const INTERACTIVE_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2";

export function ProviderScreen({ kind, provider }: ProviderScreenProps) {
  const t = useTranslations("ProviderScreen");
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const detailsLabel = kind === "attorney" ? t("attorneyDetails") : t("doctorDetails");
  const changeLabel = kind === "attorney" ? t("changeAttorney") : t("changeDoctor");

  return (
    <div className="flex h-dvh w-full flex-col bg-white md:mx-auto md:max-w-[720px]">
      <StatusBarPlaceholder />
      <ScreenHeader
        showLanguageSelector={false}
        showCallButton={false}
      />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        {/* Title block — Figma: 28/800 headline, 12px gap, 16/700 #5C5C5C subtitle */}
        <div className="flex flex-col gap-[12px]">
          <h1
            className="text-[28px] font-extrabold leading-[29.12px] text-black"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {kind === "attorney" ? t("attorneyHeading") : t("doctorHeading")}
          </h1>
          <p
            className="text-[16px] font-bold leading-[17.6px] text-[#5C5C5C]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {provider.name}
          </p>
        </div>

        {/* Action cards — 31px under the title block, 16px apart */}
        <ul className="mt-[31px] flex flex-col gap-[16px]">
          <li>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className={`${CARD_CLASS} ${INTERACTIVE_CLASS}`}
            >
              <span className="flex items-center gap-[8px]">
                <LayoutList
                  size={16}
                  strokeWidth={2}
                  className="shrink-0 text-[#cc007e]"
                  aria-hidden="true"
                />
                <span
                  className={LABEL_CLASS}
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {detailsLabel}
                </span>
              </span>
              <span
                className="flex items-center"
                aria-hidden="true"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="shrink-0"
                >
                  <path
                    d="M6 4l4 4-4 4"
                    stroke="#9CA3AF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          </li>

          {kind === "attorney" ? (
            <>
              {/* Group chat and Change attorney are present in the design but
                  currently non-interactive in product. */}
              <li className={`${CARD_CLASS} cursor-not-allowed bg-[#f3f4f6]`}>
                <span className="flex items-center gap-[8px]">
                  <MessageSquareText
                    size={16}
                    strokeWidth={2}
                    className="shrink-0 text-[#9CA3AF]"
                    aria-hidden="true"
                  />
                  <span
                    className="text-[16px] font-semibold leading-[15px] text-[#9CA3AF]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {t("groupChat")}
                  </span>
                </span>
              </li>

              <li className={`${CARD_CLASS_TALL} cursor-not-allowed bg-[#f3f4f6]`}>
                <span className="flex items-center gap-[8px]">
                  <Repeat
                    size={20}
                    strokeWidth={2}
                    className="shrink-0 text-[#9CA3AF]"
                    aria-hidden="true"
                  />
                  <span
                    className="text-[16px] font-semibold leading-[15px] text-[#9CA3AF]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {changeLabel}
                  </span>
                </span>
              </li>
            </>
          ) : (
            <>
              <li className={CARD_CLASS}>
                <span className="flex items-center gap-[8px]">
                  <MessageSquareText
                    size={16}
                    strokeWidth={2}
                    className="shrink-0 text-[#cc007e]"
                    aria-hidden="true"
                  />
                  <span
                    className={LABEL_CLASS}
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {t("groupChat")}
                  </span>
                </span>
                <span className="flex items-center gap-[12px]">
                  <span
                    className="size-[10px] rounded-full bg-[#cc007e]"
                    aria-hidden="true"
                  />
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path
                      d="M6 4l4 4-4 4"
                      stroke="#9CA3AF"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </li>

              <li>
                <a
                  href={`mailto:${provider.contact.email}`}
                  onClick={() => posthog.capture("provider_contact_started", { provider_type: kind, contact_method: "email" })}
                  className={`${CARD_CLASS} ${INTERACTIVE_CLASS}`}
                >
                  <span className="flex items-center gap-[8px]">
                    <Mail
                      size={16}
                      strokeWidth={2}
                      className="shrink-0 text-[#cc007e]"
                      aria-hidden="true"
                    />
                    <span
                      className={LABEL_CLASS}
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      {t("email")}
                    </span>
                  </span>
                </a>
              </li>

              <li>
                <a
                  href={toTelHref(provider.contact.phone)}
                  onClick={() => posthog.capture("provider_contact_started", { provider_type: kind, contact_method: "phone" })}
                  className={`${CARD_CLASS_TALL} ${INTERACTIVE_CLASS}`}
                >
                  <span className="flex items-center gap-[8px]">
                    <Phone
                      size={20}
                      strokeWidth={2}
                      className="shrink-0 text-[#cc007e]"
                      aria-hidden="true"
                    />
                    <span
                      className={LABEL_CLASS}
                      style={{ fontFamily: "var(--font-nunito-sans)" }}
                    >
                      {t("call")}
                    </span>
                  </span>
                </a>
              </li>

              <li className={CARD_CLASS_TALL}>
                <span className="flex items-center gap-[8px]">
                  <Repeat
                    size={20}
                    strokeWidth={2}
                    className="shrink-0 text-[#cc007e]"
                    aria-hidden="true"
                  />
                  <span
                    className={LABEL_CLASS}
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {changeLabel}
                  </span>
                </span>
              </li>
            </>
          )}
        </ul>
      </main>

      <ScreenFooter
        label={t("goToDashboard")}
        onClick={() => router.push(`/${locale}/intake/dashboard`)}
      />

      <ProviderDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        ariaLabel={detailsLabel}
        contact={provider.contact}
      />
    </div>
  );
}
