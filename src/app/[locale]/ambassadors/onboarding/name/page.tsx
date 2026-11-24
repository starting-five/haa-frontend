"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { FloatingInput } from "@/components/ui/floating-input";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

export default function AmbassadorOnboardingNamePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const tc = useTranslations("Common");
  const t = useTranslations("OnboardingAmbassadorName");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");

  const canContinue = useMemo(
    () => firstName.trim().length > 0 && preferredName.trim().length > 0,
    [firstName, preferredName]
  );

  const handleContinue = () => {
    if (!canContinue) return;

    sessionStorage.setItem("onboarding_ambassador_firstName", firstName.trim());
    sessionStorage.setItem("onboarding_ambassador_lastName", lastName.trim());
    sessionStorage.setItem("onboarding_ambassador_preferredName", preferredName.trim());
    sessionStorage.setItem("onboarding_ambassador_locale", locale);
    router.push(`/${locale}/ambassadors/onboarding/location`);
  };

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
        <h1
          className="text-[28px] font-extrabold leading-[1.04] text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>

        <div className="mt-[24px] flex flex-col gap-[24px]">
          <FloatingInput
            id="ambassadorFirstName"
            label={t("firstName")}
            value={firstName}
            onChange={setFirstName}
            focusBorderColor="#cc007e"
            focusBorderWidth="1px"
            reserveErrorSpace={false}
          />

          <FloatingInput
            id="ambassadorLastName"
            label={t("lastNameOptional")}
            value={lastName}
            onChange={setLastName}
            focusBorderColor="#cc007e"
            focusBorderWidth="1px"
            reserveErrorSpace={false}
          />

          <FloatingInput
            id="ambassadorPreferredName"
            label={t("preferredName")}
            value={preferredName}
            onChange={setPreferredName}
            focusBorderColor="#cc007e"
            focusBorderWidth="1px"
            reserveErrorSpace={false}
          />
        </div>
      </main>

      <ScreenFooter
        label={tc("continue")}
        onClick={handleContinue}
        disabled={!canContinue}
      />
    </div>
  );
}
