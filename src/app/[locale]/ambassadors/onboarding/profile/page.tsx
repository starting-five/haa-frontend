"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { FloatingInput } from "@/components/ui/floating-input";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

function normalizeUsername(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._]+/g, "");
}

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._]{2,29}$/;

function buildInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || first.toUpperCase() || "A";
}

export default function AmbassadorOnboardingProfilePage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorProfile");

  useRequireSessionKey("onboarding_ambassador_email", "/ambassadors/onboarding/phone");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const storedFirstName = sessionStorage.getItem("onboarding_ambassador_firstName") ?? "";
    const storedLastName = sessionStorage.getItem("onboarding_ambassador_lastName") ?? "";
    const storedAvatarUrl = sessionStorage.getItem("onboarding_ambassador_avatarDataUrl") ?? "";
    const storedUsername = normalizeUsername(
      sessionStorage.getItem("onboarding_ambassador_username") ??
        sessionStorage.getItem("onboarding_ambassador_linkKey") ??
        ""
    ).slice(0, 30);
    const rawRoles = sessionStorage.getItem("onboarding_ambassador_roles") ?? "[]";
    let roleKey = "";
    try {
      const parsed = JSON.parse(rawRoles) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === "string") {
        roleKey = parsed[0];
      }
    } catch {
      roleKey = "";
    }

    setFirstName(storedFirstName);
    setLastName(storedLastName);
    setDisplayName("");
    setUsername(storedUsername);
    setAvatarDataUrl(storedAvatarUrl);

    // Best-effort draft sync so role/name/location are durable before profile completion.
    void fetch("/api/ambassadors/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draftOnly: true,
        firstName: storedFirstName,
        lastName: storedLastName,
        preferredName: sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "",
        organization: sessionStorage.getItem("onboarding_ambassador_organization") ?? "",
        city: sessionStorage.getItem("onboarding_ambassador_city") ?? "",
        roleKey,
      }),
    });
  }, []);

  const initials = useMemo(() => buildInitials(firstName, lastName), [firstName, lastName]);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("imageTypeError"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      setAvatarDataUrl(result);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const handleContinue = async () => {
    if (saving) return;

    const trimmedDisplayName = displayName.trim();
    const normalizedUsername = normalizeUsername(username);

    if (!trimmedDisplayName) {
      setError(t("displayNameRequired"));
      return;
    }
    if (!normalizedUsername) {
      setError(t("usernameRequired"));
      return;
    }
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError(t("usernameInvalid"));
      return;
    }

    const rawRoles = sessionStorage.getItem("onboarding_ambassador_roles") ?? "[]";
    let roleKey = "";
    try {
      const parsed = JSON.parse(rawRoles) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === "string") {
        roleKey = parsed[0];
      }
    } catch {
      roleKey = "";
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/ambassadors/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: trimmedDisplayName,
          username: normalizedUsername,
          email: (sessionStorage.getItem("onboarding_ambassador_email") ?? "").trim().toLowerCase(),
          avatarDataUrl,
          firstName: sessionStorage.getItem("onboarding_ambassador_firstName") ?? "",
          lastName: sessionStorage.getItem("onboarding_ambassador_lastName") ?? "",
          preferredName: sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "",
          organization: sessionStorage.getItem("onboarding_ambassador_organization") ?? "",
          city: sessionStorage.getItem("onboarding_ambassador_city") ?? "",
          roleKey,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        if (payload?.error === "username_unavailable") {
          setError(t("usernameUnavailable"));
        } else if (payload?.error === "username_invalid") {
          setError(t("usernameInvalid"));
        } else {
          setError(t("saveProfileFailed"));
        }
        setSaving(false);
        return;
      }

      sessionStorage.setItem("onboarding_ambassador_displayName", trimmedDisplayName);
      sessionStorage.setItem("onboarding_ambassador_username", normalizedUsername);
      sessionStorage.setItem("onboarding_ambassador_linkKey", normalizedUsername);
      if (avatarDataUrl) {
        sessionStorage.setItem("onboarding_ambassador_avatarDataUrl", avatarDataUrl);
      } else {
        sessionStorage.removeItem("onboarding_ambassador_avatarDataUrl");
      }

      // Leave saving=true through navigation so the button doesn't flash back to enabled before unmount.
      router.push(`/${locale}/ambassadors/onboarding/link`);
    } catch {
      setError(t("saveProfileFailed"));
      setSaving(false);
    }
  };

  return (
    <div className="h-dvh flex flex-col max-w-[393px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showCallButton={false} />

      <main className="flex-1 overflow-y-auto px-[24px] pt-[32px] pb-[24px]">
        <h1
          className="text-[36px] font-extrabold leading-[0.95] text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>
        <p
          className="mt-[8px] text-[16px] font-normal leading-[22px] text-[#6e6e73]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("subtext")}
        </p>

        <div className="mt-[24px] rounded-[20px] bg-white p-[20px]">
          <div className="mx-auto relative h-[128px] w-[128px]">
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarDataUrl}
                alt={t("profilePicture")}
                className="h-full w-full rounded-full border-2 border-[#cc007e] object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-[#cc007e] bg-[#f3f4f6] text-[44px] font-extrabold text-[#111827]">
                {initials}
              </div>
            )}
            <label className="absolute bottom-0 right-0 flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-full border border-[#cc007e] bg-white text-[#cc007e] shadow-[0_6px_14px_rgba(204,0,126,0.2)]">
              <Camera size={16} />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
          </div>

          <p
            className="mt-[14px] text-center text-[16px] font-bold text-[#111827]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("profilePicture")}
          </p>
        </div>

        <div className="mt-[24px] flex flex-col gap-[20px]">
          <FloatingInput
            id="ambassadorDisplayName"
            label={t("displayName")}
            value={displayName}
            onChange={(value) => {
              setDisplayName(value);
              if (error) setError("");
            }}
            reserveErrorSpace={false}
          />

          <FloatingInput
            id="ambassadorUsername"
            label={t("username")}
            value={username}
            onChange={(value) => {
              setUsername(normalizeUsername(value).slice(0, 30));
              if (error) setError("");
            }}
            reserveErrorSpace={false}
          />

          {error ? <p className="text-[13px] font-medium leading-[18px] text-[#b42318]">{error}</p> : null}
        </div>
      </main>

      <ScreenFooter
        label={saving ? t("savingProfile") : t("cta")}
        onClick={handleContinue}
        disabled={saving}
      />
    </div>
  );
}
