"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { register } from "@/services/intake";
import { IntakeHeader } from "@/components/intake/intake-header";
import { Eye, EyeOff } from "lucide-react";

function StepDone({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-[4px] px-[12px] py-[4px] rounded-[22px] bg-[#ecedf1]">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
      >
        <circle
          cx="7"
          cy="7"
          r="6.5"
          stroke="#9391a3"
        />
        <path
          d="M4.5 7L6.5 9L9.5 5.5"
          stroke="#9391a3"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[12px] font-medium text-[#9391a3]">{label}</span>
    </div>
  );
}

function StepActive({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center justify-center px-[12px] py-[4px] rounded-[22px] bg-[#010101]">
      <span className="text-[12px] font-medium text-white">
        {step} {label}
      </span>
    </div>
  );
}

export default function PortalPasswordPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("Portal.password");
  const tp = useTranslations("Portal");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const rules = [
    { label: t("ruleLength"), met: password.length >= 8 },
    { label: t("ruleNumber"), met: /\d/.test(password) },
    { label: t("ruleUppercase"), met: /[A-Z]/.test(password) },
  ];
  const allRulesMet = rules.every((r) => r.met);

  const handleSubmit = async () => {
    const newErrors: Record<string, boolean> = {};
    if (!password || !allRulesMet) newErrors.password = true;
    if (password !== confirm) newErrors.confirm = true;
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const email = sessionStorage.getItem("portal_email") ?? "";
    const firstName = sessionStorage.getItem("portal_firstName") ?? "";
    const lastName = sessionStorage.getItem("portal_lastName") ?? "";

    setLoading(true);
    try {
      const data = await register({ email, firstName, lastName, password });

      if ("status" in data && data.status === "approved") {
        sessionStorage.removeItem("portal_email");
        sessionStorage.removeItem("portal_firstName");
        sessionStorage.removeItem("portal_lastName");
        router.push(`/${locale}/portal/sign-up/success`);
      } else if ("error" in data && data.error === "account_exists") {
        router.push(`/${locale}/portal`);
      } else {
        setErrors({ submit: true });
      }
    } catch {
      setErrors({ submit: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[120px]">
      <IntakeHeader />

      <div className="px-[33px] pt-[25px] flex flex-col gap-[20px]">
        <div className="flex gap-[5px]">
          <StepDone label={tp("stepAccount")} />
          <StepActive
            step={2}
            label={tp("stepProfile")}
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

        {/* Password */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("passwordLabel")}</p>
          <div
            className={`relative bg-[#feffff] h-[42px] rounded-[8px] border px-[12px] flex items-center gap-2 focus-within:border-[#cc007e] transition-colors ${errors.password || errors.passwordLength ? "border-[#cc007e]" : "border-[#cdcdcd]"}`}
          >
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((p) => ({ ...p, password: false, passwordLength: false }));
              }}
              className="flex-1 text-[14px] text-black placeholder:text-[#8c8c8c] outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="shrink-0 text-[#354052]"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && <p className="text-[11px] text-[#cc007e] px-[11px]">{t("passwordWeak")}</p>}
          {/* Password strength checklist — always visible */}
          <div className="flex flex-col gap-[4px] px-[4px] pt-[4px]">
            {rules.map((rule) => (
              <div
                key={rule.label}
                className="flex items-center gap-[6px]"
              >
                <div
                  className={`w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0 ${rule.met ? "bg-[#00c853]" : "bg-[#ecedf1]"}`}
                >
                  {rule.met && (
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                    >
                      <path
                        d="M1.5 4L3 5.5L6.5 2"
                        stroke="white"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className={`text-[11px] ${rule.met ? "text-[#00c853]" : "text-[#9391a3]"}`}>{rule.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Confirm */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("confirmLabel")}</p>
          <div
            className={`relative bg-[#feffff] h-[42px] rounded-[8px] border px-[12px] flex items-center gap-2 focus-within:border-[#cc007e] transition-colors ${errors.confirm ? "border-[#cc007e]" : "border-[#cdcdcd]"}`}
          >
            <input
              type={showConfirm ? "text" : "password"}
              placeholder={t("confirmPlaceholder")}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setErrors((p) => ({ ...p, confirm: false }));
              }}
              className="flex-1 text-[14px] text-black placeholder:text-[#8c8c8c] outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="shrink-0 text-[#354052]"
            >
              {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.confirm && <p className="text-[11px] text-[#cc007e] px-[11px]">{t("passwordMismatch")}</p>}
        </div>

        {errors.submit && <p className="text-[12px] text-[#cc007e]">{tp("error")}</p>}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[393px] px-[18px] pb-[40px] bg-white">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-[52px] bg-[#cc007e] rounded-[12px] text-white text-[16px] font-semibold disabled:opacity-60"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {loading ? t("submitting") : t("submit")}
        </button>
      </div>
    </div>
  );
}
