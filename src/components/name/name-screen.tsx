"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { FloatingInput } from "@/components/ui/floating-input";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface NameScreenProps {
  heading: string;
  onContinue: (firstName: string, lastName: string) => void;
  initialFirstName?: string;
  initialLastName?: string;
  loading?: boolean;
  error?: string;
}

export function NameScreen({
  heading,
  onContinue,
  initialFirstName = "",
  initialLastName = "",
  loading = false,
  error,
}: NameScreenProps) {
  const t = useTranslations("NameScreen");
  const tc = useTranslations("Common");
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [errors, setErrors] = useState({ firstName: "", lastName: "" });

  const canContinue = firstName.trim() !== "" && lastName.trim() !== "";

  const validateName = (value: string): string | undefined => {
    if (/[^a-zA-ZÀ-ÿ\s'\-]/.test(value)) return t("invalidName");
  };

  const handleContinue = () => {
    const newErrors = {
      firstName: validateName(firstName) ?? "",
      lastName: validateName(lastName) ?? "",
    };
    setErrors(newErrors);
    if (newErrors.firstName || newErrors.lastName) return;
    onContinue(firstName.trim(), lastName.trim());
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <form
        id="name-form"
        className="flex-1 overflow-y-auto px-[24px] pt-[32px]"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        <h1
          className="text-[28px] font-extrabold text-[#111] leading-none mb-[24px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {heading}
        </h1>

        <div className="flex flex-col gap-[8px]">
          <FloatingInput
            id="firstName"
            label={t("firstName")}
            value={firstName}
            focusBorderColor="#CC007E"
            focusBorderWidth="1px"
            onChange={(v) => {
              setFirstName(v);
              if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: "" }));
            }}
            error={errors.firstName}
            validate={validateName}
          />
          <FloatingInput
            id="lastName"
            label={t("lastName")}
            value={lastName}
            focusBorderColor="#CC007E"
            focusBorderWidth="1px"
            onChange={(v) => {
              setLastName(v);
              if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: "" }));
            }}
            error={errors.lastName}
            validate={validateName}
          />
        </div>
      </form>

      <ScreenFooter
        label={tc("continue")}
        formId="name-form"
        disabled={!canContinue}
        loading={loading}
        error={error}
      />
    </div>
  );
}
