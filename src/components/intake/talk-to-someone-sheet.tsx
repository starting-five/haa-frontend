"use client";

import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, ChevronRight, Phone } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";

interface TalkToSomeoneSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueOnMyOwn?: () => void;
}

export function TalkToSomeoneSheet({ open, onOpenChange, onContinueOnMyOwn }: TalkToSomeoneSheetProps) {
  const t = useTranslations("IntakeTell");
  const tUnavailable = useTranslations("IntakeCallUnavailable");
  const [step, setStep] = useState<"options" | "unavailable">("options");

  useEffect(() => {
    if (!open) setStep("options");
  }, [open]);

  const handleCallNow = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenChange(false);
    window.location.href = SUPPORT_PHONE_TEL;
  };

  const handleScheduleTime = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setStep("unavailable");
  };

  const handleContinueOnMyOwn = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenChange(false);
    onContinueOnMyOwn?.();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto w-full md:max-w-[720px] rounded-t-[24px] border-t border-[#efefef] bg-white px-[24px] pb-[24px] pt-[10px] shadow-[0_-10px_15px_rgba(0,0,0,0.10)]"
      >
        <div className="mx-auto mb-[24px] h-[5px] w-[36px] rounded-[2.5px] bg-[#e5e5ea]" />

        {step === "options" ? (
          <>
            <SheetTitle
              className="mb-[12px] text-[22px] font-extrabold text-[#1c1c1e]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {t("callSheetTitle")}
            </SheetTitle>
            <SheetDescription className="sr-only">{t("callSheetDescription")}</SheetDescription>

            <div className="flex flex-col gap-[12px]">
              <button
                type="button"
                onClick={handleCallNow}
                className="flex w-full items-center gap-[16px] rounded-[16px] border border-[rgba(229,229,234,0.5)] bg-[rgba(242,242,247,0.2)] p-[16px] text-left"
              >
                <div className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[rgba(204,0,126,0.07)]">
                  <Phone
                    size={22}
                    className="text-[#cc007e]"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[16px] font-bold leading-normal text-[#1c1c1e]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {t("callNow")}
                  </p>
                  <p
                    className="text-[13px] font-normal leading-normal text-[#636366]"
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    {t("callNowSub")}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[#8e8e93]"
                />
              </button>

              <button
                type="button"
                onClick={handleScheduleTime}
                className="flex w-full items-center gap-[16px] rounded-[16px] border border-[rgba(229,229,234,0.5)] bg-[rgba(242,242,247,0.2)] p-[16px] text-left"
              >
                <div className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[rgba(204,0,126,0.07)]">
                  <Calendar
                    size={22}
                    className="text-[#cc007e]"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[16px] font-bold leading-normal text-[#1c1c1e]"
                    style={{ fontFamily: "var(--font-nunito-sans)" }}
                  >
                    {t("scheduleTime")}
                  </p>
                  <p
                    className="text-[13px] font-normal leading-normal text-[#636366]"
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    {t("scheduleTimeSub")}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[#8e8e93]"
                />
              </button>
            </div>

            <div className="my-[16px] h-px w-full bg-[rgba(229,229,234,0.5)]" />

            <div className="flex w-full justify-center py-[8px]">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t("callSheetClose")}
                className="text-[16px] font-semibold text-[#8e8e93]"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {t("cancel")}
              </button>
            </div>
          </>
        ) : (
          <>
            <SheetTitle
              className="mb-[8px] text-[22px] font-extrabold leading-normal text-[#1c1c1e]"
              style={{ fontFamily: "var(--font-nunito-sans)" }}
            >
              {tUnavailable("heading")}
            </SheetTitle>
            <SheetDescription
              className="mb-[24px] text-[15px] font-normal leading-[20px] text-[#636366]"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {tUnavailable("subtext")}
            </SheetDescription>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleContinueOnMyOwn}
                className="text-[14px] font-normal leading-normal text-[#636366] underline"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {tUnavailable("continueOnMyOwn")}
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
