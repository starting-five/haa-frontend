"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { IntakeHeader } from "@/components/intake/intake-header";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export default function PortalLoginPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("Portal.login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  // Reset loading on mount in case Next.js restores cached state
  useEffect(() => {
    setLoading(false);
  }, []);

  const handleSignIn = async () => {
    const newErrors: Record<string, boolean> = {};
    if (!email) newErrors.email = true;
    if (!password) newErrors.password = true;
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrors({ credentials: true });
      setLoading(false);
      return;
    }

    router.push(`/${locale}/portal/dashboard`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[120px]">
      <IntakeHeader />

      <form
        id="login-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSignIn();
        }}
        className="px-[33px] pt-[30px] flex flex-col gap-[20px]"
      >
        <div>
          <h1
            className="text-[28px] font-extrabold text-black leading-tight mb-[6px]"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("heading")}
          </h1>
          <p className="text-[13px] text-[#8c8c8c]">{t("subtext")}</p>
        </div>

        {/* Email */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("emailLabel")}</p>
          <div
            className={`relative bg-[#feffff] h-[42px] rounded-[8px] border px-[12px] flex items-center focus-within:border-[#cc007e] transition-colors ${
              errors.email || errors.credentials ? "border-[#cc007e]" : "border-[#cdcdcd]"
            }`}
          >
            <input
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors({});
              }}
              className="w-full text-[14px] text-black placeholder:text-[#8c8c8c] outline-none bg-transparent"
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium text-[#bcbcbc] px-[11px]">{t("passwordLabel")}</p>
          <div
            className={`relative bg-[#feffff] h-[42px] rounded-[8px] border px-[12px] flex items-center gap-2 focus-within:border-[#cc007e] transition-colors ${
              errors.password || errors.credentials ? "border-[#cc007e]" : "border-[#cdcdcd]"
            }`}
          >
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors({});
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
          {errors.credentials && <p className="text-[11px] text-[#cc007e] px-[11px]">{t("invalidCredentials")}</p>}
        </div>

        <p className="text-[13px] text-[#8c8c8c] text-center">
          {t("noAccount")}{" "}
          <Link
            href={`/${locale}/portal/sign-up`}
            className="text-[#cc007e] font-semibold"
          >
            {t("signUp")}
          </Link>
        </p>
      </form>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[393px] px-[18px] pb-[40px] bg-white">
        <button
          type="submit"
          form="login-form"
          disabled={loading}
          className="w-full h-[52px] bg-[#cc007e] rounded-[12px] text-white text-[16px] font-semibold disabled:opacity-60"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {loading ? t("signingIn") : t("signIn")}
        </button>
      </div>
    </div>
  );
}
