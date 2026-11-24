"use client";

import { type TouchEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_MAILTO,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_SMS,
  SUPPORT_PHONE_TEL,
} from "@/lib/constants";

// The "Need help? Contact HAA" action, shared by the patient and Brand
// Ambassador dashboards: a bottom sheet offering Call, Text and Email, each
// handing off to the phone's own app. Every flow that offers Contact HAA
// renders this so the three destinations live in one place.

// How far the grabber has to be dragged before the sheet closes.
const CLOSE_SWIPE_PX = 90;

interface ContactHaaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OPTIONS = [
  { key: "call", icon: Phone, href: SUPPORT_PHONE_TEL, detail: SUPPORT_PHONE_DISPLAY },
  { key: "text", icon: MessageSquare, href: SUPPORT_PHONE_SMS, detail: SUPPORT_PHONE_DISPLAY },
  { key: "email", icon: Mail, href: SUPPORT_EMAIL_MAILTO, detail: SUPPORT_EMAIL },
] as const;

export function ContactHaaSheet({ open, onOpenChange }: ContactHaaSheetProps) {
  const t = useTranslations("ContactHaaSheet");
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef<number | null>(null);

  const resetDrag = () => {
    setDragOffset(0);
    setDragging(false);
    startYRef.current = null;
  };

  const close = () => {
    resetDrag();
    onOpenChange(false);
  };

  const openNativeApp = (href: string) => {
    close();
    window.location.assign(href);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetDrag();
    onOpenChange(next);
  };

  const handleGrabberTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startYRef.current = touch.clientY;
    setDragging(true);
  };

  const handleGrabberTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    const touch = event.touches[0];
    if (!touch) return;

    const delta = touch.clientY - startYRef.current;
    if (delta <= 0) {
      setDragOffset(0);
      return;
    }

    event.preventDefault();
    setDragOffset(delta);
  };

  const handleGrabberTouchEnd = () => {
    if (startYRef.current === null) return;
    const shouldClose = dragOffset >= CLOSE_SWIPE_PX;
    resetDrag();
    if (shouldClose) onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto w-full md:max-w-[720px] rounded-t-[24px] border-t border-[#efefef] bg-white px-[24px] pb-[24px] pt-[10px] shadow-[0_-10px_15px_rgba(0,0,0,0.10)]"
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
      >
        <div
          className="mx-auto mb-[24px] h-[5px] w-[36px] rounded-[2.5px] bg-[#e5e5ea] touch-none"
          onTouchStart={handleGrabberTouchStart}
          onTouchMove={handleGrabberTouchMove}
          onTouchEnd={handleGrabberTouchEnd}
          onTouchCancel={handleGrabberTouchEnd}
        />

        <SheetTitle
          className="mb-[8px] text-[22px] font-extrabold text-[#1c1c1e]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("title")}
        </SheetTitle>
        <SheetDescription
          className="mb-[16px] text-[14px] text-[#636366]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("description")}
        </SheetDescription>

        <div className="flex flex-col gap-[12px]">
          {OPTIONS.map(({ key, icon: Icon, href, detail }) => (
            <button
              key={key}
              type="button"
              onClick={() => openNativeApp(href)}
              className="flex w-full items-center gap-[16px] rounded-[16px] border border-[rgba(229,229,234,0.5)] bg-[rgba(242,242,247,0.2)] p-[16px] text-left"
            >
              <div className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-[rgba(204,0,126,0.07)]">
                <Icon
                  size={22}
                  className="text-[#cc007e]"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[16px] font-bold leading-normal text-[#1c1c1e]"
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {t(key)}
                </p>
                <p
                  className="text-[13px] font-normal leading-normal text-[#636366]"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {detail}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="my-[16px] h-px w-full bg-[rgba(229,229,234,0.5)]" />

        <div className="flex w-full justify-center py-[8px]">
          <button
            type="button"
            onClick={close}
            className="text-[16px] font-semibold text-[#8e8e93]"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {t("cancel")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
