"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { LocationInput } from "@/components/location-input";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { CopyButton } from "@/components/ui/copy-button";
import { FloatingInput } from "@/components/ui/floating-input";
import { FloatingSelect } from "@/components/ui/floating-select";
import { buildAmbassadorLinkPreview, formatDisplayLink, toAbsoluteLink } from "@/lib/ambassador-link";
import { AMBASSADOR_ROLE_KEYS, type AmbassadorRoleKey } from "@/lib/constants";
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

// What the ambassador arrived with. The CTA stays disabled until one of these
// differs — Figma 3830:5955 only turns it magenta once something has changed.
interface ProfileSnapshot {
  avatarDataUrl: string;
  roleKey: AmbassadorRoleKey | "";
  city: string;
  organization: string;
}

function buildInitials(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return `${first}${last}`.toUpperCase() || first.toUpperCase() || "A";
}

function isAmbassadorRoleKey(value: string): value is AmbassadorRoleKey {
  return (AMBASSADOR_ROLE_KEYS as readonly string[]).includes(value);
}

function normalizeStoredRoleKey(value: string): AmbassadorRoleKey | "" {
  if (isAmbassadorRoleKey(value)) return value;
  if (value === "citizen") return "everydayHero";
  return "";
}

export default function AmbassadorDashboardProfileEditPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("OnboardingAmbassadorProfile");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [shortLink, setShortLink] = useState("");
  const [roleKey, setRoleKey] = useState<AmbassadorRoleKey | "">("");
  const [city, setCity] = useState("");
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [initialProfile, setInitialProfile] = useState<ProfileSnapshot | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const roleOptions = useMemo(
    () =>
      AMBASSADOR_ROLE_KEYS.map((option) => ({
        value: option,
        label: t(`roleOptions.${option}` as never),
      })),
    [t]
  );

  useEffect(() => {
    const storedFirstName = sessionStorage.getItem("onboarding_ambassador_firstName") ?? "";
    const storedLastName = sessionStorage.getItem("onboarding_ambassador_lastName") ?? "";
    const storedAvatarUrl = sessionStorage.getItem("onboarding_ambassador_avatarDataUrl") ?? "";
    const storedDisplayName = sessionStorage.getItem("onboarding_ambassador_displayName") ?? "";
    const storedPreferredName = sessionStorage.getItem("onboarding_ambassador_preferredName") ?? "";
    const storedShortLink = sessionStorage.getItem("onboarding_ambassador_shortLink") ?? "";
    const storedCity = sessionStorage.getItem("onboarding_ambassador_city") ?? "";
    const storedOrganization = sessionStorage.getItem("onboarding_ambassador_organization") ?? "";
    const storedPhone = sessionStorage.getItem("onboarding_ambassador_phone") ?? "";
    const storedEmail = sessionStorage.getItem("onboarding_ambassador_email") ?? "";
    const rawRoles = sessionStorage.getItem("onboarding_ambassador_roles") ?? "[]";
    let storedRoleKey = "";
    try {
      const parsed = JSON.parse(rawRoles) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === "string") {
        storedRoleKey = parsed[0];
      }
    } catch {
      storedRoleKey = "";
    }
    const storedUsername = normalizeUsername(
      sessionStorage.getItem("onboarding_ambassador_username") ??
        sessionStorage.getItem("onboarding_ambassador_linkKey") ??
        ""
    ).slice(0, 30);
    const normalizedRoleKey = normalizeStoredRoleKey(storedRoleKey);

    setFirstName(storedFirstName);
    setLastName(storedLastName);
    setDisplayName(storedDisplayName.trim() || storedPreferredName.trim() || storedFirstName.trim());
    setUsername(storedUsername);
    setAvatarDataUrl(storedAvatarUrl);
    setShortLink(storedShortLink);
    setRoleKey(normalizedRoleKey);
    setCity(storedCity);
    setOrganization(storedOrganization);
    setPhone(storedPhone);
    setEmail(storedEmail);
    setInitialProfile({
      avatarDataUrl: storedAvatarUrl,
      roleKey: normalizedRoleKey,
      city: storedCity.trim(),
      organization: storedOrganization.trim(),
    });

    void (async () => {
      try {
        const response = await fetch("/api/ambassadors/profile", { method: "GET" });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          avatarDataUrl?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          preferredName?: string | null;
          displayName?: string | null;
          username?: string | null;
          usernameDisplay?: string | null;
          shortLink?: string | null;
          roleKey?: string | null;
          city?: string | null;
          organization?: string | null;
          phone?: string | null;
          email?: string | null;
        } | null;
        const persistedAvatar = payload?.avatarDataUrl ?? "";
        const persistedFirstName = payload?.firstName?.trim() ?? "";
        const persistedLastName = payload?.lastName?.trim() ?? "";
        const persistedPreferredName = payload?.preferredName?.trim() ?? "";
        const persistedDisplayName = payload?.displayName?.trim() ?? "";
        const persistedUsername = normalizeUsername(
          payload?.usernameDisplay?.trim() || payload?.username?.trim() || ""
        ).slice(0, 30);
        const persistedShortLink = payload?.shortLink?.trim() ?? "";
        const persistedRoleKey = normalizeStoredRoleKey(payload?.roleKey?.trim() ?? "");
        const persistedCity = payload?.city?.trim() ?? "";
        const persistedOrganization = payload?.organization?.trim() ?? "";
        const persistedPhone = payload?.phone?.trim() ?? "";
        const persistedEmail = payload?.email?.trim() ?? "";

        if (persistedAvatar) {
          setAvatarDataUrl(persistedAvatar);
          sessionStorage.setItem("onboarding_ambassador_avatarDataUrl", persistedAvatar);
        }
        if (persistedFirstName) {
          setFirstName(persistedFirstName);
          sessionStorage.setItem("onboarding_ambassador_firstName", persistedFirstName);
        }
        if (persistedLastName) {
          setLastName(persistedLastName);
          sessionStorage.setItem("onboarding_ambassador_lastName", persistedLastName);
        }
        if (persistedPreferredName) {
          sessionStorage.setItem("onboarding_ambassador_preferredName", persistedPreferredName);
        }
        if (persistedDisplayName || persistedPreferredName || persistedFirstName) {
          const nextDisplayName = persistedDisplayName || persistedPreferredName || persistedFirstName;
          setDisplayName(nextDisplayName);
          sessionStorage.setItem("onboarding_ambassador_displayName", nextDisplayName);
        }
        if (persistedUsername) {
          setUsername(persistedUsername);
          sessionStorage.setItem("onboarding_ambassador_username", persistedUsername);
          sessionStorage.setItem("onboarding_ambassador_linkKey", persistedUsername);
        }
        if (persistedShortLink) {
          setShortLink(persistedShortLink);
          sessionStorage.setItem("onboarding_ambassador_shortLink", persistedShortLink);
        }

        setRoleKey(persistedRoleKey);
        setCity(persistedCity);
        setOrganization(persistedOrganization);
        if (persistedPhone) {
          setPhone(persistedPhone);
          sessionStorage.setItem("onboarding_ambassador_phone", persistedPhone);
        }
        if (persistedEmail) {
          setEmail(persistedEmail);
          sessionStorage.setItem("onboarding_ambassador_email", persistedEmail);
        }

        if (persistedRoleKey) {
          sessionStorage.setItem("onboarding_ambassador_roles", JSON.stringify([persistedRoleKey]));
        }
        if (persistedCity) {
          sessionStorage.setItem("onboarding_ambassador_city", persistedCity);
        }
        if (persistedOrganization) {
          sessionStorage.setItem("onboarding_ambassador_organization", persistedOrganization);
        }

        // the saved values arriving late are the baseline, not unsaved edits.
        setInitialProfile({
          avatarDataUrl: persistedAvatar || storedAvatarUrl,
          roleKey: persistedRoleKey,
          city: persistedCity,
          organization: persistedOrganization,
        });
      } catch {
        // Keep local session avatar if profile fetch is unavailable.
      }
    })();
  }, []);

  const initials = useMemo(() => buildInitials(firstName, lastName), [firstName, lastName]);

  const usernameHandle = username.trim();
  // The pill shows the provisioned short link, falling back to the preview the
  // username implies — Figma never draws this row without a link in it.
  const displayLink = shortLink
    ? formatDisplayLink(shortLink)
    : usernameHandle
      ? buildAmbassadorLinkPreview(usernameHandle)
      : "";

  const hasChanges =
    initialProfile !== null &&
    (avatarDataUrl !== initialProfile.avatarDataUrl ||
      roleKey !== initialProfile.roleKey ||
      city.trim() !== initialProfile.city ||
      organization.trim() !== initialProfile.organization);

  // The same rules handleSave enforces — an edit that could only fail must not
  // light the CTA up in the first place.
  const isValid = displayName.trim().length > 0 && USERNAME_PATTERN.test(normalizeUsername(username));
  const canSave = hasChanges && isValid;

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

  const handleSave = async () => {
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
          email: (email || "").trim().toLowerCase(),
          avatarDataUrl,
          organization: organization.trim(),
          city: city.trim(),
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
      sessionStorage.setItem("onboarding_ambassador_city", city.trim());
      sessionStorage.setItem("onboarding_ambassador_organization", organization.trim());
      if (roleKey) {
        sessionStorage.setItem("onboarding_ambassador_roles", JSON.stringify([roleKey]));
      } else {
        sessionStorage.removeItem("onboarding_ambassador_roles");
      }
      if (avatarDataUrl) {
        sessionStorage.setItem("onboarding_ambassador_avatarDataUrl", avatarDataUrl);
      } else {
        sessionStorage.removeItem("onboarding_ambassador_avatarDataUrl");
      }

      // what was just persisted is the new baseline, so a stalled navigation
      // leaves the CTA disabled rather than inviting a duplicate save
      setInitialProfile({
        avatarDataUrl,
        roleKey,
        city: city.trim(),
        organization: organization.trim(),
      });
      setSaving(false);
      router.push(`/${locale}/ambassadors/dashboard`);
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
          className="text-[28px] font-extrabold leading-[29.12px] text-[#111]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("dashboardHeading")}
        </h1>

        {/* 115px identity row, 99px avatar, 16px gutter — Figma 3827:5582 */}
        <div className="mt-[16px] flex h-[115px] items-center gap-[16px]">
          <div className="relative h-[107px] w-[99px] shrink-0">
            {avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarDataUrl}
                alt={t("profilePicture")}
                className="size-[99px] rounded-full object-cover"
              />
            ) : (
              <div className="flex size-[99px] items-center justify-center rounded-full bg-[#d1d5db] text-[36px] font-extrabold text-[#4b5563]">
                {initials}
              </div>
            )}
            {/* the badge sits on the circle's lower-right edge and overhangs it by 8px */}
            <label className="absolute left-[60px] top-[81px] flex size-[26px] cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#cc007e] text-white">
              <Camera
                size={14}
                strokeWidth={2}
              />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <p
              className="truncate text-[24px] font-extrabold leading-[33px] text-[#212426]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {displayName || t("missingValue")}
            </p>

            <p
              className="truncate text-[14px] font-medium leading-[19px] text-[#8a9099]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              @{usernameHandle || t("missingValue")}
            </p>

            <div className="flex h-[32px] items-center justify-between gap-[8px] rounded-[8px] bg-[#f2f4f7] px-[12px]">
              <p
                className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-[16px] text-[#212426]"
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {displayLink || t("linkPending")}
              </p>
              <CopyButton
                value={toAbsoluteLink(displayLink)}
                label={t("copyLink")}
                size={16}
                className="size-[16px] shrink-0"
              />
            </div>
          </div>
        </div>

        {/* one 12px-gapped stack — Figma runs the role, city, organization, phone
            and email fields at the same rhythm (3830:5955) */}
        <div className="mt-[12px] space-y-[12px]">
          <FloatingSelect
            id="dashboardProfileRole"
            label={t("roleLabel")}
            value={roleKey}
            onChange={(value) => setRoleKey(value as AmbassadorRoleKey | "")}
            options={roleOptions}
            variant="compact"
            reserveErrorSpace={false}
          />

          <LocationInput
            id="dashboardProfileCity"
            label={t("cityLabel")}
            value={city}
            onChange={setCity}
            cityStateOnly
            showUseCurrentLocation={false}
            focusBorderColor="#cc007e"
            focusBorderWidth="1px"
            reserveErrorSpace={false}
          />

          <FloatingInput
            id="dashboardProfileOrganization"
            label={t("organizationLabel")}
            value={organization}
            onChange={setOrganization}
            focusBorderColor="#cc007e"
            focusBorderWidth="1px"
            reserveErrorSpace={false}
          />

          <FloatingInput
            id="dashboardProfilePhone"
            label={t("phoneLabel")}
            value={phone || t("missingValue")}
            onChange={() => {}}
            readOnly
            disabled
            reserveErrorSpace={false}
          />

          <FloatingInput
            id="dashboardProfileEmail"
            label={t("emailLabel")}
            value={email || t("missingValue")}
            onChange={() => {}}
            readOnly
            disabled
            reserveErrorSpace={false}
          />
        </div>

        {error ? <p className="mt-[14px] text-[13px] font-medium leading-[18px] text-[#b42318]">{error}</p> : null}
      </main>

      <ScreenFooter
        label={t("saveChanges")}
        onClick={handleSave}
        disabled={saving || !canSave}
        secondaryLabel={t("cancel")}
        onSecondaryClick={() => router.push(`/${locale}/ambassadors/dashboard`)}
        secondaryVariant="link"
      />
    </div>
  );
}
