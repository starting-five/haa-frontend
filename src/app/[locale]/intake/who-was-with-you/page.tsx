"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { FloatingInput } from "@/components/ui/floating-input";
import { usePreloadImages } from "@/hooks/use-preload-images";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { companionRelationLabelKey, companionRelationsFor } from "@/lib/companion-relations";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Companion = {
  firstName: string;
  lastName: string;
  relation: string;
  cellNumber: string;
  email: string;
};

type WithYouAnswer = "yes" | "no";

const EMPTY_COMPANION: Companion = {
  firstName: "",
  lastName: "",
  relation: "",
  cellNumber: "",
  email: "",
};

function formatUSPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function extractDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

// The interstitial that follows opens on the protect-case character.
const NEXT_SCREEN_IMAGES = ["/assets/intake/haa-protect.webp"] as const;

export default function IntakeWhoWasWithYouPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const manageToken = useSearchParams().get("manage");
  const t = useTranslations("IntakeWhoWasWithYou");
  const [people, setPeople] = useState<Companion[]>([]);
  const [answer, setAnswer] = useState<WithYouAnswer | null>(null);
  const [showChoice, setShowChoice] = useState(true);
  const [mode, setMode] = useState<"review" | "form">("form");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<Companion>(EMPTY_COMPANION);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [error, setError] = useState("");

  useRequireSessionKey("intake_role", "/intake/role");
  usePreloadImages(NEXT_SCREEN_IMAGES);

  // The patient's own role decides which relations are offered (see companionRelationsFor).
  const [patientRole, setPatientRole] = useState<string | null>(null);
  const relationLabel = (relation: string) => {
    const key = companionRelationLabelKey(relation);
    return key ? t(key) : relation;
  };
  const relationOptions = companionRelationsFor(patientRole).map((value) => ({ value, label: relationLabel(value) }));
  const returnToReview = Boolean(manageToken);
  const nextPath = returnToReview ? `/${locale}/intake/review` : `/${locale}/intake/protect-case`;

  const hasCompleteCellNumber = extractDigits(form.cellNumber).length === 10;
  const isFormComplete = form.firstName.trim().length > 0 && form.relation.trim().length > 0 && hasCompleteCellNumber;

  const hasInvalidEmail = form.email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const hasInvalidCellNumber = form.cellNumber.trim().length > 0 && !hasCompleteCellNumber;

  const persistPeople = (values: Companion[]) => {
    sessionStorage.setItem("intake_who_was_with_you_people", JSON.stringify(values));

    // Keep the original key in sync for backward compatibility with existing reads.
    const legacyNames = values
      .map((person) => `${person.firstName.trim()} ${person.lastName.trim()}`.trim())
      .filter(Boolean)
      .join("\n");
    sessionStorage.setItem("intake_who_was_with_you", legacyNames);
  };

  useEffect(() => {
    setPatientRole(sessionStorage.getItem("intake_role"));

    let initialPeople: Companion[] = [];

    const rawPeople = sessionStorage.getItem("intake_who_was_with_you_people");
    if (rawPeople) {
      try {
        const parsed = JSON.parse(rawPeople) as Companion[];
        if (Array.isArray(parsed)) {
          initialPeople = parsed.map((person) => ({
            firstName: person.firstName ?? "",
            lastName: person.lastName ?? "",
            relation: person.relation ?? "",
            cellNumber: person.cellNumber ?? "",
            email: person.email ?? "",
          }));
        }
      } catch {
        // fall through to legacy format
      }
    }

    if (!initialPeople.length) {
      initialPeople = (sessionStorage.getItem("intake_who_was_with_you") ?? "")
        .split("\n")
        .map((person) => person.trim())
        .filter(Boolean)
        .map((name) => {
          const [firstName, ...rest] = name.split(" ");
          return {
            ...EMPTY_COMPANION,
            firstName: firstName ?? "",
            lastName: rest.join(" "),
          };
        });
    }

    setPeople(initialPeople);

    const savedAnswer = sessionStorage.getItem("intake_who_was_with_you_answer");
    if (savedAnswer === "yes") {
      setAnswer("yes");
      setMode(initialPeople.length > 0 ? "review" : "form");
      setShowChoice(false);
      return;
    }
    if (savedAnswer === "no") {
      setAnswer("no");
      setShowChoice(true);
      return;
    }

    if (initialPeople.length > 0) {
      setAnswer("yes");
      setMode("review");
      setShowChoice(false);
    }
  }, []);

  const handleAnswer = (value: WithYouAnswer) => {
    setAnswer(value);
    sessionStorage.setItem("intake_who_was_with_you_answer", value);

    if (value === "yes") {
      setMode("form");
      sessionStorage.removeItem("intake_who_was_with_you_alone");
      setError("");
      setShowChoice(false);
      setEditingIndex(null);
      setForm(EMPTY_COMPANION);
      setShowFieldErrors(false);
      return;
    }

    handleIWasAlone();
  };

  const handleContinue = () => {
    if (!people.length) {
      setError(t("required"));
      return;
    }

    sessionStorage.setItem("intake_who_was_with_you_answer", "yes");
    persistPeople(people);
    sessionStorage.removeItem("intake_who_was_with_you_alone");
    router.push(nextPath);
  };

  const openAddPerson = () => {
    setMode("form");
    setEditingIndex(null);
    setForm(EMPTY_COMPANION);
    setShowFieldErrors(false);
    setError("");
  };

  const openEditPerson = (index: number) => {
    setMode("form");
    setEditingIndex(index);
    const person = people[index];
    const offered = companionRelationsFor(patientRole) as readonly string[];
    // A relation that is no longer offered (a "driver" saved before the patient
    // chose Driver) is cleared, so the form asks for a valid one again.
    setForm(offered.includes(person.relation) ? person : { ...person, relation: "" });
    setShowFieldErrors(false);
    setError("");
  };

  const handleRemovePerson = (index: number) => {
    const updated = people.filter((_, currentIndex) => currentIndex !== index);
    setPeople(updated);
    persistPeople(updated);
    setMode("review");
    setEditingIndex(null);
    setForm(EMPTY_COMPANION);
    setShowFieldErrors(false);
  };

  const handleSavePerson = () => {
    if (!isFormComplete || hasInvalidEmail || hasInvalidCellNumber) {
      setShowFieldErrors(true);
      return;
    }

    const normalized: Companion = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      relation: form.relation.trim(),
      cellNumber: form.cellNumber.trim(),
      email: form.email.trim(),
    };

    const updated =
      editingIndex === null
        ? [...people, normalized]
        : people.map((person, index) => (index === editingIndex ? normalized : person));

    setPeople(updated);
    persistPeople(updated);
    sessionStorage.removeItem("intake_who_was_with_you_alone");
    setMode("review");
    setEditingIndex(null);
    setForm(EMPTY_COMPANION);
    setShowFieldErrors(false);
  };

  // "Do this later" (Figma 2723:5420) leaves the question unanswered — it does
  // not record that the patient was alone — and moves on to the same screen the
  // two answers lead to, so the step can be revisited from the review list.
  const handleDoThisLater = () => {
    if (returnToReview) {
      router.push(`/${locale}/intake/review`);
      return;
    }
    sessionStorage.removeItem("intake_who_was_with_you_answer");
    sessionStorage.removeItem("intake_who_was_with_you_alone");
    router.push(`/${locale}/intake/protect-case`);
  };

  const handleIWasAlone = () => {
    setAnswer("no");
    sessionStorage.setItem("intake_who_was_with_you", "");
    sessionStorage.removeItem("intake_who_was_with_you_people");
    sessionStorage.setItem("intake_who_was_with_you_alone", "true");
    router.push(nextPath);
  };

  const updateField = (field: keyof Companion, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (showFieldErrors) setShowFieldErrors(false);
  };

  const updateCellNumber = (value: string) => {
    const digits = extractDigits(value);
    setForm((current) => ({ ...current, cellNumber: formatUSPhone(digits) }));
    if (showFieldErrors) setShowFieldErrors(false);
  };

  const handleCancelForm = () => {
    if (returnToReview) {
      router.push(`/${locale}/intake/review`);
      return;
    }

    if (people.length > 0) {
      setMode("review");
    } else {
      setShowChoice(true);
      setMode("form");
      setAnswer(null);
      sessionStorage.removeItem("intake_who_was_with_you_answer");
    }
    setEditingIndex(null);
    setForm(EMPTY_COMPANION);
    setShowFieldErrors(false);
    setError("");
  };

  const isEditing = mode === "form" && editingIndex !== null;
  // adding a person is its own action; only the list moves the flow on
  const footerLabel = mode === "form" ? (isEditing ? t("saveChanges") : t("addPersonCta")) : t("continue");
  const formSecondaryLabel = returnToReview ? t("cancel") : isEditing ? t("removePerson") : t("letsDoThisLater");

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      {showChoice ? (
        <>
          <div className="flex-1 overflow-y-auto px-[24px] pt-[32px]">
            <h1
              className="text-[28px] font-extrabold text-[#111] leading-none"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("heading")}
            </h1>

            <div className="mt-[24px] flex flex-col gap-0">
              <button
                type="button"
                onClick={() => handleAnswer("yes")}
                className={`h-[59px] w-full rounded-[16px] border bg-white px-[20px] text-[16px] font-bold text-black ${
                  answer === "yes" ? "border-[#cc007e]" : "border-[#d9d9d9]"
                }`}
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("yes")}
              </button>

              <p
                className="mt-[5px] mb-[24px] text-center text-[14px] font-normal text-[#a0a0a0]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("emptyHint")}
              </p>

              <button
                type="button"
                onClick={() => handleAnswer("no")}
                className={`h-[59px] w-full rounded-[16px] border bg-white px-[20px] text-[16px] font-bold text-black ${
                  answer === "no" ? "border-[#cc007e]" : "border-[#d9d9d9]"
                }`}
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("no")}
              </button>
            </div>
          </div>

          {/* Figma 2723:5420 — the empty state offers "Do this later"; it sits
              65px above the bottom of the frame, in the footer's own band. */}
          <div className="w-full shrink-0 bg-white px-[20px] pb-[65px] pt-[24px] md:px-[28px]">
            <button
              type="button"
              onClick={handleDoThisLater}
              className="w-full text-center text-[14px] font-medium text-[#6e6e73] underline"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {t("doThisLater")}
            </button>
          </div>
        </>
      ) : (
        <form
          id="who-was-with-you-form"
          className="flex-1 overflow-y-auto px-[24px] pt-[32px]"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === "form") {
              handleSavePerson();
              return;
            }
            handleContinue();
          }}
        >
          <h1
            className={`text-[28px] font-extrabold text-[#111] leading-none ${mode === "review" ? "mb-[20px]" : "mb-[32px]"}`}
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {mode === "form" ? (isEditing ? t("editPersonHeading") : t("addPersonHeading")) : t("listHeading")}
          </h1>

          {mode === "review" ? (
            <div className="flex flex-col gap-[12px]">
              {people.map((person, index) => (
                <div
                  key={`${person.firstName}-${person.lastName}-${index}`}
                  className="rounded-[16px] border border-[#e5e5ea] bg-white p-[16px]"
                >
                  <div className="flex items-start justify-between gap-[12px]">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex flex-col gap-[6px]">
                        <div className="flex min-w-0 items-center gap-[8px]">
                          <p className="truncate text-[16px] font-bold text-[#000]">
                            {`${person.firstName} ${person.lastName}`.trim()}
                          </p>
                          {!!person.relation.trim() && (
                            <span className="shrink-0 rounded-[6px] bg-[#fee2e2] px-[8px] py-[2px] text-[11px] font-bold text-[#000]">
                              {relationLabel(person.relation)}
                            </span>
                          )}
                        </div>
                        {!!person.cellNumber.trim() && (
                          <p className="truncate text-[14px] font-normal text-[#6e6e73]">
                            {formatUSPhone(extractDigits(person.cellNumber)) || person.cellNumber}
                          </p>
                        )}
                        {!!person.email.trim() && (
                          <p className="truncate text-[14px] font-normal text-[#6e6e73]">{person.email}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 self-center items-center gap-[4px]">
                      <button
                        type="button"
                        onClick={() => openEditPerson(index)}
                        aria-label={t("edit")}
                        className="relative inline-flex size-[16px] items-center justify-center text-[#cc007e] before:absolute before:-inset-x-[2px] before:-inset-y-[10px] before:content-['']"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePerson(index)}
                        aria-label={t("remove")}
                        className="relative inline-flex size-[16px] items-center justify-center text-[#111828] before:absolute before:-inset-x-[2px] before:-inset-y-[10px] before:content-['']"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={openAddPerson}
                className="mt-[12px] flex h-[50px] w-full items-center justify-center gap-[10px] rounded-[16px] border border-[#e5e5ea] bg-white px-[16px] text-[15px] font-bold text-[#000]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                <Plus
                  size={16}
                  className="shrink-0 text-[#cc007e]"
                />
                <span>{t("addPerson")}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-[20px]">
              <FloatingInput
                id="companionFirstName"
                label={t("firstNameLabel")}
                value={form.firstName}
                onChange={(value) => updateField("firstName", value)}
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                error={showFieldErrors && !form.firstName.trim() ? t("firstNameRequired") : ""}
                reserveErrorSpace={false}
              />

              <FloatingInput
                id="companionLastName"
                label={t("lastNameLabel")}
                value={form.lastName}
                onChange={(value) => updateField("lastName", value)}
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                reserveErrorSpace={false}
              />

              <div className="flex flex-col gap-[8px]">
                <p className="text-[14px] font-bold text-[#000]">{t("theyWereLabel")}:</p>
                <div className="grid grid-cols-3 gap-[12px]">
                  {relationOptions.map((option) => {
                    const isSelected = form.relation === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateField("relation", option.value)}
                        className={`flex h-[46px] items-center justify-center rounded-[12px] bg-white px-[14px] text-center text-[15px] font-normal leading-[18px] text-[#6e6e73] ${
                          isSelected ? "border border-[#cc007e]" : "border border-[#e5e5ea]"
                        }`}
                        style={{ fontFamily: "var(--font-inter)" }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {showFieldErrors && !form.relation.trim() && (
                  <p className="px-1 text-[12px] text-[#cc007e]">{t("theyWereRequired")}</p>
                )}
              </div>

              <FloatingInput
                id="companionCell"
                label={t("cellNumberLabel")}
                value={form.cellNumber}
                onChange={updateCellNumber}
                type="tel"
                inputMode="tel"
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                error={showFieldErrors && !hasCompleteCellNumber ? t("cellNumberRequired") : ""}
                reserveErrorSpace={false}
              />

              <FloatingInput
                id="companionEmail"
                label={t("emailAddressLabel")}
                value={form.email}
                onChange={(value) => updateField("email", value)}
                type="email"
                inputMode="email"
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                validate={(value) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : t("emailInvalid"))}
                error={showFieldErrors && hasInvalidEmail ? t("emailInvalid") : ""}
                reserveErrorSpace
              />
            </div>
          )}

          {mode === "review" && (
            <p
              role="alert"
              aria-live="polite"
              className="mt-[4px] h-[20px] px-1 text-[12px] text-[#cc007e]"
            >
              {error}
            </p>
          )}
        </form>
      )}

      {!showChoice && (mode === "form" || mode === "review") && (
        <ScreenFooter
          label={footerLabel}
          formId="who-was-with-you-form"
          disabled={mode === "form" ? !isFormComplete || hasInvalidEmail || hasInvalidCellNumber : people.length === 0}
          secondaryLabel={mode === "form" ? formSecondaryLabel : undefined}
          onSecondaryClick={
            mode === "form"
              ? isEditing && editingIndex !== null
                ? () => handleRemovePerson(editingIndex)
                : handleCancelForm
              : undefined
          }
          secondaryVariant="link"
        />
      )}
    </div>
  );
}
