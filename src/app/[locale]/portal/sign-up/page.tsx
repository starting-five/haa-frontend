"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { checkEmail } from "@/services/intake";
import { IntakeHeader } from "@/components/intake/intake-header";
import { ChevronDown } from "lucide-react";

function StepPill({ step, label, active }: { step: number; label: string; active: boolean }) {
  return (
    <div
      className={`flex items-center justify-center px-[12px] py-[4px] rounded-[22px] text-[12px] font-medium ${
        active ? "bg-[#010101] text-white" : "bg-[#ecedf1] text-[#9391a3]"
      }`}
    >
      {step} {label}
    </div>
  );
}

export default function PortalSignUpPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("Portal.signUp");
  const tc = useTranslations("Common");
  const tp = useTranslations("Portal");

  const [role, setRole] = useState("lawyer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [practice, setPractice] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [waitlist, setWaitlist] = useState(false);

  const handleContinue = async () => {
    const newErrors: Record<string, boolean> = {};
    if (!firstName) newErrors.firstName = true;
    if (!lastName) newErrors.lastName = true;
    if (!email) newErrors.email = true;
    if (!mobile) newErrors.mobile = true;
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setLoading(true);
    try {
      const data = await checkEmail({ email, firstName, lastName, mobile, practice, role });

      if (data.status === "waitlist") {
        setWaitlist(true);
      } else if (data.status === "approved") {
        sessionStorage.setItem("portal_email", email);
        sessionStorage.setItem("portal_firstName", firstName);
        sessionStorage.setItem("portal_lastName", lastName);
        router.push(`/${locale}/portal/sign-up/password`);
      } else {
        setErrors({ submit: true });
      }
    } catch {
      setErrors({ submit: true });
    } finally {
      setLoading(false);
    }
  };

  if (waitlist) {
    return (
      <div className="min-h-screen bg-white flex flex-col px-[33px] pt-[120px] pb-[40px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/logo/black-logo.png"
          alt="HelpAfterAccident"
          width={154}
          height={22}
          className="mb-[60px]"
        />
        <h1
          className="text-[28px] font-extrabold text-black mb-[16px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("waitlistTitle")}
        </h1>
        <p className="text-[15px] text-[#8c8c8c] leading-relaxed">{t("waitlistText")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[120px]">
      <IntakeHeader />

      <div className="px-[33px] pt-[25px] flex flex-col gap-[20px]">
        <div className="flex gap-[5px]">
          <StepPill
            step={1}
            label={tp("stepAccount")}
            active
          />
          <StepPill
            step={2}
            label={tp("stepProfile")}
            active={false}
          />
        </div>

        <div>
          <h1
            className="text-[20px] font-bold text-black"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p className="text-[12px] font-medium text-[#8c8c8c] mt-[2px]">{t("subtext")}</p>
        </div>

        {/* Role dropdown */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("roleLabel")}</p>
          <div className="relative bg-[#feffff] h-[42px] rounded-[8px] border border-[#cdcdcd] px-[12px] flex items-center focus-within:border-[#cc007e] transition-colors">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full text-[14px] text-black outline-none bg-transparent appearance-none"
            >
              <option value="lawyer">{t("roleLawyer")}</option>
              <option value="doctor">{t("roleDoctor")}</option>
            </select>
            <ChevronDown className="absolute right-3 w-5 h-5 text-[#8c8c8c] pointer-events-none shrink-0" />
          </div>
        </div>

        {/* First + Last name */}
        <div className="flex gap-[5px]">
          {(
            [
              { key: "firstName", label: t("firstNameLabel"), value: firstName, set: setFirstName },
              { key: "lastName", label: t("lastNameLabel"), value: lastName, set: setLastName },
            ] as const
          ).map(({ key, label, value, set }) => (
            <div
              key={key}
              className="flex flex-col gap-[3px] w-[calc(50%-3px)]"
            >
              <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{label}</p>
              <div
                className={`bg-[#feffff] h-[42px] rounded-[8px] border px-[12px] flex items-center focus-within:border-[#cc007e] transition-colors ${errors[key] ? "border-[#cc007e]" : "border-[#cdcdcd]"}`}
              >
                <input
                  type="text"
                  placeholder={label}
                  value={value}
                  onChange={(e) => {
                    set(e.target.value);
                    setErrors((p) => ({ ...p, [key]: false }));
                  }}
                  className="w-full text-[14px] text-black placeholder:text-[#8c8c8c] outline-none bg-transparent"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("emailLabel")}</p>
          <div
            className={`bg-[#feffff] h-[42px] rounded-[8px] border px-[12px] flex items-center focus-within:border-[#cc007e] transition-colors ${errors.email ? "border-[#cc007e]" : "border-[#cdcdcd]"}`}
          >
            <input
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((p) => ({ ...p, email: false }));
              }}
              className="w-full text-[14px] text-black placeholder:text-[#8c8c8c] outline-none bg-transparent"
            />
          </div>
        </div>

        {/* Mobile */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("mobileLabel")}</p>
          <div
            className={`bg-[#feffff] h-[42px] rounded-[8px] border px-[12px] flex items-center focus-within:border-[#cc007e] transition-colors ${errors.mobile ? "border-[#cc007e]" : "border-[#cdcdcd]"}`}
          >
            <input
              type="tel"
              placeholder={t("mobilePlaceholder")}
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value);
                setErrors((p) => ({ ...p, mobile: false }));
              }}
              className="w-full text-[14px] text-black placeholder:text-[#8c8c8c] outline-none bg-transparent"
            />
          </div>
        </div>

        {/* Practice */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("practiceLabel")}</p>
          <div className="bg-[#feffff] h-[42px] rounded-[8px] border border-[#cdcdcd] px-[12px] flex items-center focus-within:border-[#cc007e] transition-colors">
            <input
              type="text"
              placeholder={t("practicePlaceholder")}
              value={practice}
              onChange={(e) => setPractice(e.target.value)}
              className="w-full text-[14px] text-black placeholder:text-[#8c8c8c] outline-none bg-transparent"
            />
          </div>
        </div>

        {errors.submit && <p className="text-[12px] text-[#cc007e]">{tp("error")}</p>}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[393px] px-[18px] pb-[40px] bg-white">
        <button
          onClick={handleContinue}
          disabled={loading}
          className="w-full h-[52px] bg-[#cc007e] rounded-[12px] text-white text-[16px] font-semibold disabled:opacity-60"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {loading ? t("continuing") : tc("continue")}
        </button>
      </div>
    </div>
  );
}
