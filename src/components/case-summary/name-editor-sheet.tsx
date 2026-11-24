"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";

interface NameEditorSheetProps {
  initialFirstName: string;
  initialLastName: string;
  onSave: (firstName: string, lastName: string) => void;
  onCancel: () => void;
  // Case Summary shows the patient's phone and email in this sheet, locked:
  // they are how the patient signs in and is reached, and changing them needs
  // its own verified flow. The intake Review screen passes nothing here.
  lockedContact?: { phone: string; email: string };
  // a message for a name the backend would refuse, or null when it is fine
  validateName?: (value: string) => string | null;
}

export function NameEditorSheet({
  initialFirstName,
  initialLastName,
  onSave,
  onCancel,
  lockedContact,
  validateName,
}: NameEditorSheetProps) {
  const t = useTranslations("IntakeReview");
  const tSummary = useTranslations("CaseSummary");
  const [firstNameDraft, setFirstNameDraft] = useState(initialFirstName);
  const [lastNameDraft, setLastNameDraft] = useState(initialLastName);
  const [showNameErrors, setShowNameErrors] = useState(false);
  const [invalidNameMessage, setInvalidNameMessage] = useState<string | null>(null);

  const handleSaveName = () => {
    const firstName = firstNameDraft.trim();
    const lastName = lastNameDraft.trim();
    if (!firstName || !lastName) {
      setShowNameErrors(true);
      return;
    }

    const invalid = validateName ? (validateName(firstName) ?? validateName(lastName)) : null;
    if (invalid) {
      setInvalidNameMessage(invalid);
      return;
    }

    onSave(firstName, lastName);
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/35">
      {/* the locked contact rows make the sheet taller — it scrolls on a short screen */}
      <div
        className={`${lockedContact ? "max-h-[85dvh] overflow-y-auto " : ""}w-full rounded-t-[20px] bg-white px-[20px] pb-[24px] pt-[12px]`}
      >
        <div className="mx-auto mb-[12px] h-[4px] w-[44px] rounded-full bg-[#d1d1d6]" />
        <h2
          className="mb-[16px] text-center text-[20px] font-extrabold text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("editNameTitle")}
        </h2>

        <div className="flex flex-col gap-[12px]">
          <div>
            <label
              htmlFor="review-first-name"
              className="mb-[6px] block text-[14px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("firstNameLabel")}
            </label>
            <input
              id="review-first-name"
              type="text"
              value={firstNameDraft}
              onChange={(event) => {
                setFirstNameDraft(event.target.value);
                if (showNameErrors) setShowNameErrors(false);
                if (invalidNameMessage) setInvalidNameMessage(null);
              }}
              className="h-[52px] w-full rounded-[12px] border border-[#e5e5ea] px-[14px] text-[16px] text-[#111] outline-none focus:border-[#cc007e]"
              style={{ fontFamily: "var(--font-inter)" }}
            />
          </div>

          <div>
            <label
              htmlFor="review-last-name"
              className="mb-[6px] block text-[14px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("lastNameLabel")}
            </label>
            <input
              id="review-last-name"
              type="text"
              value={lastNameDraft}
              onChange={(event) => {
                setLastNameDraft(event.target.value);
                if (showNameErrors) setShowNameErrors(false);
                if (invalidNameMessage) setInvalidNameMessage(null);
              }}
              className="h-[52px] w-full rounded-[12px] border border-[#e5e5ea] px-[14px] text-[16px] text-[#111] outline-none focus:border-[#cc007e]"
              style={{ fontFamily: "var(--font-inter)" }}
            />
          </div>

          {/* Locked contact — visible, not editable, and out of the tab order */}
          {lockedContact && (
            <>
              <LockedField
                id="case-summary-phone"
                label={tSummary("phoneLabel")}
                value={lockedContact.phone}
                describedBy="case-summary-contact-locked"
              />
              <LockedField
                id="case-summary-email"
                label={tSummary("emailLabel")}
                value={lockedContact.email || tSummary("notProvided")}
                describedBy="case-summary-contact-locked"
              />
              <p
                id="case-summary-contact-locked"
                className="flex items-start gap-[6px] text-[12px] leading-[16px] text-[#6e6e73]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                <Lock
                  size={12}
                  aria-hidden
                  className="mt-[2px] shrink-0"
                />
                {tSummary("contactLocked")}
              </p>
            </>
          )}
        </div>

        {showNameErrors && (
          <p
            className="mt-[8px] text-[12px] text-[#cc007e]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("nameRequired")}
          </p>
        )}

        {invalidNameMessage && (
          <p
            role="alert"
            className="mt-[8px] text-[12px] text-[#cc007e]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {invalidNameMessage}
          </p>
        )}

        <div className="mt-[16px] flex flex-col gap-[8px]">
          <button
            type="button"
            onClick={handleSaveName}
            disabled={!firstNameDraft.trim() || !lastNameDraft.trim()}
            className={`h-[56px] w-full rounded-[16px] text-[16px] font-semibold ${
              !firstNameDraft.trim() || !lastNameDraft.trim()
                ? "bg-[#e5e5e5] text-[#8c8c8c] cursor-not-allowed"
                : "bg-brand text-white"
            }`}
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("saveChanges")}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="h-[24px] text-center text-[14px] font-semibold text-[#6E6E73] underline"
            style={{ fontFamily: "var(--font-nunito-sans)" }}
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LockedField({
  id,
  label,
  value,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  describedBy: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-[6px] block text-[14px] font-semibold text-[#111]"
        style={{ fontFamily: "var(--font-nunito-sans)" }}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          readOnly
          disabled
          aria-readonly="true"
          aria-describedby={describedBy}
          className="h-[52px] w-full cursor-not-allowed rounded-[12px] border border-[#e5e5ea] bg-[#f2f2f7] px-[14px] pr-[40px] text-[16px] text-[#6e6e73] outline-none"
          style={{ fontFamily: "var(--font-inter)" }}
        />
        <Lock
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-[14px] top-1/2 -translate-y-1/2 text-[#8e8e93]"
        />
      </div>
    </div>
  );
}
