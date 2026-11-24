"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { LocationInput } from "@/components/location-input";
import { INCIDENT_TYPE_VALUES, ROLE_VALUES } from "@/types/intake";
import type { LocationDetails } from "@/types/location";

const CALENDAR_CLASS_NAMES = {
  month: "flex w-full flex-col gap-[20px]",
  month_caption: "flex h-[24px] w-full items-center justify-start px-0",
  caption_label: "[font-family:var(--font-nunito-sans)] font-extrabold text-[18px] text-[#212426]",
  nav: "absolute inset-x-0 top-0 flex w-full items-center justify-end gap-[12px]",
  button_previous:
    "flex items-center justify-center size-[32px] rounded-full bg-[#f2f2f7] text-[#212426] shrink-0 hover:bg-[#e5e5ea] aria-disabled:opacity-50",
  button_next:
    "flex items-center justify-center size-[32px] rounded-full bg-[#f2f2f7] text-[#212426] shrink-0 hover:bg-[#e5e5ea] aria-disabled:opacity-50",
  weekdays: "flex w-full justify-between",
  weekday: "[font-family:var(--font-nunito-sans)] font-bold text-[14px] text-[#a0a0a0] w-[36px] text-center",
  week: "flex w-full justify-between mt-[8px]",
  day: "w-[36px] h-[36px] p-0 text-center",
  day_button:
    "flex items-center justify-center size-[36px] rounded-full font-normal text-[15px] [font-family:var(--font-nunito-sans)] text-[#212426] hover:bg-[#f2f2f7] data-[selected-single=true]:bg-[#cc007e] data-[selected-single=true]:font-bold data-[selected-single=true]:text-white",
  outside: "text-[#a0a0a0]",
  disabled: "text-[#a0a0a0] opacity-50",
  today: "",
};

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export interface AccidentDraft {
  incidentType: string;
  incidentDate: string;
  incidentLocation: string;
  incidentLocationDetails: LocationDetails | null;
  role: string;
}

interface AccidentEditorSheetProps {
  locale: string;
  initial: AccidentDraft;
  onSave: (accident: AccidentDraft) => void;
  onCancel: () => void;
}

export function AccidentEditorSheet({ locale, initial, onSave, onCancel }: AccidentEditorSheetProps) {
  const t = useTranslations("IntakeReview");
  const tIncident = useTranslations("IntakeIncident");
  const tRole = useTranslations("IntakeRole");
  const tLocation = useTranslations("IntakeLocation");

  const [accidentTypeDraft, setAccidentTypeDraft] = useState(initial.incidentType);
  const [accidentDateDraft, setAccidentDateDraft] = useState(initial.incidentDate);
  const [accidentLocationDraft, setAccidentLocationDraft] = useState(initial.incidentLocation);
  const [accidentLocationDetailsDraft, setAccidentLocationDetailsDraft] = useState<LocationDetails | null>(
    initial.incidentLocationDetails
  );
  // valid as the incident screen judges it: a place it resolved, details and all
  const [isAccidentLocationValid, setIsAccidentLocationValid] = useState(
    Boolean(initial.incidentLocationDetails && initial.incidentLocation.trim())
  );
  const [roleDraft, setRoleDraft] = useState(initial.role);
  const [showAccidentErrors, setShowAccidentErrors] = useState(false);
  const [showFutureDateError, setShowFutureDateError] = useState(false);
  const [showAccidentCalendar, setShowAccidentCalendar] = useState(false);

  const handleSaveAccident = () => {
    const incidentType = accidentTypeDraft.trim();
    const incidentDate = accidentDateDraft.trim();
    const incidentLocation = accidentLocationDraft.trim();
    const role = roleDraft.trim();

    if (!incidentType || !incidentDate || !incidentLocation || !role || !isAccidentLocationValid) {
      setShowAccidentErrors(true);
      setShowFutureDateError(false);
      return;
    }

    if (incidentDate > toISODate(new Date())) {
      setShowFutureDateError(true);
      setShowAccidentErrors(false);
      return;
    }

    setShowFutureDateError(false);
    setShowAccidentCalendar(false);
    onSave({
      incidentType,
      incidentDate,
      incidentLocation,
      incidentLocationDetails: accidentLocationDetailsDraft,
      role,
    });
  };

  const incomplete =
    !accidentTypeDraft.trim() ||
    !accidentDateDraft.trim() ||
    !accidentLocationDraft.trim() ||
    !isAccidentLocationValid ||
    !roleDraft.trim();

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/35">
      <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-[20px] bg-white px-[20px] pb-[24px] pt-[12px]">
        <div className="mx-auto mb-[12px] h-[4px] w-[44px] rounded-full bg-[#d1d1d6]" />
        <h2
          className="mb-[16px] text-center text-[20px] font-extrabold text-black"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("editAccidentTitle")}
        </h2>

        <div className="flex flex-col gap-[12px]">
          <div>
            <label
              htmlFor="review-accident-type"
              className="mb-[6px] block text-[14px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("accidentTypeLabel")}
            </label>
            <div className="relative">
              <select
                id="review-accident-type"
                value={accidentTypeDraft}
                onChange={(event) => {
                  setAccidentTypeDraft(event.target.value);
                  if (showAccidentErrors) setShowAccidentErrors(false);
                }}
                className="h-[52px] w-full appearance-none rounded-[12px] border border-[#e5e5ea] bg-white px-[14px] pr-[40px] text-[16px] text-[#111] shadow-[0_1px_0_rgba(0,0,0,0.03)] outline-none focus:border-[#cc007e]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                <option value="">{t("selectOption")}</option>
                {INCIDENT_TYPE_VALUES.map((value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {tIncident(`options.${value}` as never)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 text-[#8e8e93]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="review-accident-date"
              className="mb-[6px] block text-[14px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("dateLabel")}
            </label>
            <div className="relative">
              <input
                id="review-accident-date"
                type="text"
                readOnly
                value={
                  accidentDateDraft
                    ? new Intl.DateTimeFormat(locale, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(parseISODate(accidentDateDraft))
                    : ""
                }
                placeholder={t("datePlaceholder")}
                className="h-[52px] w-full rounded-[12px] border border-[#e5e5ea] bg-white px-[14px] pr-[44px] text-[16px] text-[#111] outline-none focus:border-[#cc007e]"
                style={{ fontFamily: "var(--font-inter)" }}
              />
              <button
                type="button"
                aria-label={t("openCalendar")}
                onClick={() => setShowAccidentCalendar((value) => !value)}
                className="absolute right-[10px] top-1/2 -translate-y-1/2 rounded-[8px] p-[6px] text-[#8e8e93] hover:bg-[#f2f2f7]"
              >
                <CalendarDays size={18} />
              </button>
            </div>
            {showAccidentCalendar && (
              <div className="mt-[8px] rounded-[16px] border border-[#e5e5ea] bg-white p-[12px]">
                <Calendar
                  mode="single"
                  selected={accidentDateDraft ? parseISODate(accidentDateDraft) : undefined}
                  onSelect={(date) => {
                    setAccidentDateDraft(date ? toISODate(date) : "");
                    setShowAccidentCalendar(false);
                    if (showAccidentErrors) setShowAccidentErrors(false);
                    if (showFutureDateError) setShowFutureDateError(false);
                  }}
                  disabled={{ after: new Date() }}
                  classNames={CALENDAR_CLASS_NAMES}
                  className="w-full [--cell-size:36px]"
                />
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="review-accident-location"
              className="mb-[6px] block text-[14px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("locationLabel")}
            </label>
            <LocationInput
              id="review-accident-location"
              label={t("locationLabel")}
              value={accidentLocationDraft}
              onValidityChange={setIsAccidentLocationValid}
              onLocationDetailsChange={setAccidentLocationDetailsDraft}
              onChange={(next) => {
                setAccidentLocationDraft(next);
                if (showAccidentErrors) setShowAccidentErrors(false);
              }}
              reserveErrorSpace={false}
              useCurrentLocationLabel={tLocation("useCurrentLocation")}
              locationErrorMessage={tLocation("locationError")}
            />
          </div>

          <div>
            <label
              htmlFor="review-role"
              className="mb-[6px] block text-[14px] font-semibold text-[#111]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("roleLabel")}
            </label>
            <div className="relative">
              <select
                id="review-role"
                value={roleDraft}
                onChange={(event) => {
                  setRoleDraft(event.target.value);
                  if (showAccidentErrors) setShowAccidentErrors(false);
                }}
                className="h-[52px] w-full appearance-none rounded-[12px] border border-[#e5e5ea] bg-white px-[14px] pr-[40px] text-[16px] text-[#111] shadow-[0_1px_0_rgba(0,0,0,0.03)] outline-none focus:border-[#cc007e]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                <option value="">{t("selectOption")}</option>
                {ROLE_VALUES.map((item) => (
                  <option
                    key={item.value}
                    value={item.value}
                  >
                    {tRole(item.value as never)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 text-[#8e8e93]"
              />
            </div>
          </div>
        </div>

        {showAccidentErrors && (
          <p
            className="mt-[8px] text-[12px] text-[#cc007e]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("accidentRequired")}
          </p>
        )}

        {showFutureDateError && (
          <p
            className="mt-[8px] text-[12px] text-[#cc007e]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("futureDateError")}
          </p>
        )}

        <div className="mt-[16px] flex flex-col gap-[8px]">
          <button
            type="button"
            onClick={handleSaveAccident}
            disabled={incomplete}
            className={`h-[56px] w-full rounded-[16px] text-[16px] font-semibold ${
              incomplete ? "bg-[#e5e5e5] text-[#8c8c8c] cursor-not-allowed" : "bg-brand text-white"
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
