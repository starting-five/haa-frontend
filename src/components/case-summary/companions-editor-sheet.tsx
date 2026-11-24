"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FloatingInput } from "@/components/ui/floating-input";
import { companionRelationLabelKey, companionRelationsFor } from "@/lib/companion-relations";

/** One person in Case Summary's draft: an id for someone already on the case, none for someone added. */
export interface CompanionDraft {
  id?: string;
  firstName: string;
  lastName: string;
  relation: string;
  cellNumber: string;
  email: string;
}

const EMPTY: CompanionDraft = { firstName: "", lastName: "", relation: "", cellNumber: "", email: "" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The intake's own rules (intake/who-was-with-you): a first name, a relation, a
// ten-digit US cell number, and an email only if it is a valid one.
export function cellDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return (digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits).slice(0, 10);
}

/**
 * Whether a person meets the rules Save is checked against. A companion saved
 * before these rules (a seven-digit number, a relation the form no longer
 * offers) is sent back unchanged with every save, so the sheet asks for it to
 * be updated rather than letting the whole save be refused.
 */
export function companionIsComplete(person: CompanionDraft, offered: readonly string[]): boolean {
  const email = person.email.trim();
  return (
    person.firstName.trim().length > 0 &&
    person.firstName.trim().length <= 100 &&
    person.lastName.trim().length <= 100 &&
    offered.includes(person.relation) &&
    cellDigits(person.cellNumber).length === 10 &&
    (email === "" || (email.length <= 254 && EMAIL_PATTERN.test(email)))
  );
}

export function formatCellNumber(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

interface CompanionsEditorSheetProps {
  initial: CompanionDraft[];
  /** The patient's own role, which decides the relations offered (see companionRelationsFor). */
  patientRole: string;
  onSave: (companions: CompanionDraft[]) => void;
  onCancel: () => void;
}

export function CompanionsEditorSheet({ initial, patientRole, onSave, onCancel }: CompanionsEditorSheetProps) {
  const t = useTranslations("IntakeWhoWasWithYou");
  const tReview = useTranslations("IntakeReview");
  const tSummary = useTranslations("CaseSummary");
  const [people, setPeople] = useState<CompanionDraft[]>(initial);
  // null: the list; -1: adding someone; otherwise the index being edited
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<CompanionDraft>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);

  const offered = companionRelationsFor(patientRole) as readonly string[];
  const relationLabel = (relation: string) => {
    const key = companionRelationLabelKey(relation);
    return key ? t(key) : relation;
  };

  const hasCompleteCell = cellDigits(form.cellNumber).length === 10;
  const hasInvalidEmail = form.email.trim().length > 0 && !EMAIL_PATTERN.test(form.email.trim());
  const formValid = companionIsComplete(form, offered);
  const incomplete = people.filter((person) => !companionIsComplete(person, offered)).length;

  const openForm = (index: number) => {
    const person = index >= 0 ? people[index] : EMPTY;
    // a relation no longer offered for the patient's role is asked for again, as on the intake
    setForm({
      ...person,
      relation: offered.includes(person.relation) ? person.relation : "",
      cellNumber: formatCellNumber(cellDigits(person.cellNumber)),
    });
    setEditing(index);
    setShowErrors(false);
  };

  const savePerson = () => {
    if (!formValid) {
      setShowErrors(true);
      return;
    }
    const person: CompanionDraft = {
      ...(editing !== null && editing >= 0 && people[editing]?.id ? { id: people[editing].id } : {}),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      relation: form.relation,
      cellNumber: formatCellNumber(cellDigits(form.cellNumber)),
      email: form.email.trim(),
    };
    setPeople((current) =>
      editing === null || editing < 0 ? [...current, person] : current.map((p, i) => (i === editing ? person : p))
    );
    setEditing(null);
  };

  const update = (field: keyof CompanionDraft, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (showErrors) setShowErrors(false);
  };

  const buttonClass = "h-[56px] w-full rounded-[16px] text-[16px] font-semibold";
  const linkClass = "h-[24px] text-center text-[14px] font-semibold text-[#6E6E73] underline";

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="companions-editor-title"
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-[20px] bg-white px-[20px] pb-[24px] pt-[12px]"
      >
        <div className="mx-auto mb-[12px] h-[4px] w-[44px] rounded-full bg-[#d1d1d6]" />
        <h2
          id="companions-editor-title"
          className="mb-[16px] text-center text-[20px] font-extrabold text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {editing === null
            ? tSummary("editCompanionsTitle")
            : editing >= 0
              ? t("editPersonHeading")
              : t("addPersonHeading")}
        </h2>

        {editing === null ? (
          <>
            <div className="flex flex-col gap-[12px]">
              {people.length === 0 && (
                <p
                  className="text-center text-[14px] text-[#6e6e73]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {tSummary("noCompanions")}
                </p>
              )}
              {people.map((person, index) => (
                <div
                  key={person.id ?? `new-${index}`}
                  data-testid="companion-row"
                  className="flex items-start justify-between gap-[12px] rounded-[16px] border border-[#e5e5ea] bg-white p-[16px]"
                >
                  <div
                    className="min-w-0 flex-1"
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    <div className="flex min-w-0 items-center gap-[8px]">
                      <p className="truncate text-[16px] font-bold text-black">
                        {`${person.firstName} ${person.lastName}`.trim()}
                      </p>
                      {person.relation && (
                        <span className="shrink-0 rounded-[6px] bg-[#fee2e2] px-[8px] py-[2px] text-[11px] font-bold text-black">
                          {relationLabel(person.relation)}
                        </span>
                      )}
                    </div>
                    {person.cellNumber && (
                      <p className="truncate text-[14px] text-[#6e6e73]">
                        {formatCellNumber(cellDigits(person.cellNumber)) || person.cellNumber}
                      </p>
                    )}
                    {person.email && <p className="truncate text-[14px] text-[#6e6e73]">{person.email}</p>}
                    {!companionIsComplete(person, offered) && (
                      <p
                        data-testid="companion-needs-update"
                        className="mt-[4px] text-[12px] text-[#cc007e]"
                      >
                        {tSummary("companionNeedsUpdate")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-[12px] self-center">
                    <button
                      type="button"
                      onClick={() => openForm(index)}
                      aria-label={`${t("edit")} ${person.firstName}`}
                      className="inline-flex size-[24px] items-center justify-center text-[#cc007e]"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeople((current) => current.filter((_, i) => i !== index))}
                      aria-label={`${t("remove")} ${person.firstName}`}
                      className="inline-flex size-[24px] items-center justify-center text-[#111828]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => openForm(-1)}
                className="flex h-[50px] w-full items-center justify-center gap-[10px] rounded-[16px] border border-[#e5e5ea] bg-white text-[15px] font-bold text-black"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                <Plus
                  size={16}
                  className="text-[#cc007e]"
                />
                <span>{t("addPerson")}</span>
              </button>
            </div>

            <div className="mt-[16px] flex flex-col gap-[8px]">
              <button
                type="button"
                disabled={incomplete > 0}
                onClick={() => onSave(people)}
                className={`${buttonClass} ${incomplete > 0 ? "bg-[#e5e5e5] text-[#8c8c8c]" : "bg-brand text-white"}`}
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {tReview("saveChanges")}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className={linkClass}
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {tReview("cancel")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-[20px]">
              <FloatingInput
                id="caseCompanionFirstName"
                label={t("firstNameLabel")}
                value={form.firstName}
                onChange={(value) => update("firstName", value.slice(0, 100))}
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                error={showErrors && !form.firstName.trim() ? t("firstNameRequired") : ""}
                reserveErrorSpace={false}
              />
              <FloatingInput
                id="caseCompanionLastName"
                label={t("lastNameLabel")}
                value={form.lastName}
                onChange={(value) => update("lastName", value.slice(0, 100))}
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                reserveErrorSpace={false}
              />
              <div className="flex flex-col gap-[8px]">
                <p className="text-[14px] font-bold text-black">{t("theyWereLabel")}:</p>
                <div className="grid grid-cols-3 gap-[12px]">
                  {offered.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={form.relation === value}
                      onClick={() => update("relation", value)}
                      className={`flex h-[46px] items-center justify-center rounded-[12px] bg-white px-[14px] text-[15px] text-[#6e6e73] ${
                        form.relation === value ? "border border-[#cc007e]" : "border border-[#e5e5ea]"
                      }`}
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      {relationLabel(value)}
                    </button>
                  ))}
                </div>
                {showErrors && !offered.includes(form.relation) && (
                  <p className="px-1 text-[12px] text-[#cc007e]">{t("theyWereRequired")}</p>
                )}
              </div>
              <FloatingInput
                id="caseCompanionCell"
                label={t("cellNumberLabel")}
                value={form.cellNumber}
                onChange={(value) => update("cellNumber", formatCellNumber(cellDigits(value)))}
                type="tel"
                inputMode="tel"
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                error={showErrors && !hasCompleteCell ? t("cellNumberRequired") : ""}
                reserveErrorSpace={false}
              />
              <FloatingInput
                id="caseCompanionEmail"
                label={t("emailAddressLabel")}
                value={form.email}
                onChange={(value) => update("email", value)}
                type="email"
                inputMode="email"
                focusBorderColor="#CC007E"
                focusBorderWidth="1px"
                validate={(value) => (EMAIL_PATTERN.test(value) ? undefined : t("emailInvalid"))}
                error={showErrors && hasInvalidEmail ? t("emailInvalid") : ""}
                reserveErrorSpace
              />
            </div>

            <div className="mt-[16px] flex flex-col gap-[8px]">
              <button
                type="button"
                onClick={savePerson}
                className={`${buttonClass} ${formValid ? "bg-brand text-white" : "bg-[#e5e5e5] text-[#8c8c8c]"}`}
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {editing >= 0 ? t("saveChanges") : t("addPersonCta")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className={linkClass}
                style={{ fontFamily: "var(--font-nunito-sans)" }}
              >
                {t("cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
