"use client";

import Image from "next/image";
import { useCallback, useId, useState } from "react";
import { useTranslations } from "next-intl";

import { ModalDialog } from "@/components/ui/modal-dialog";
import { ProviderDetailsDialog } from "@/components/providers/provider-details-dialog";
import type { Provider } from "@/lib/providers";

interface AttorneyActionsDialogProps {
  open: boolean;
  onClose: () => void;
  provider: Provider;
}

// Figma 5373:12673 — a 14px-radius row with its 1px #E5E7EB stroke, 20/16 padding.
const ROW_CLASS =
  "flex w-full items-center justify-between gap-[12px] rounded-[14px] border border-[#E5E7EB] px-[20px] py-[16px] text-left";
const LABEL_CLASS = "text-[16px] font-semibold leading-[15px] text-[#1F2937]";

/**
 * What the connected attorney's card opens on the dashboard — Figma 5366:16012
 * (Attorney Actions Dialog). Attorney details opens the firm's contact popup;
 * Group chat and Change attorney are drawn, on the design's #F8F8F8 fill, and do
 * nothing: they are disabled buttons with no handler, so neither a pointer, a key
 * nor a script can start a chat or change the firm, and a screen reader hears
 * them as unavailable.
 */
export function AttorneyActionsDialog({ open, onClose, provider }: AttorneyActionsDialogProps) {
  const t = useTranslations("ProviderScreen");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const unavailableId = useId();

  // Closing the list forgets the details step, so the next open starts on the
  // list. Stable, because the dialog shell re-runs its focus handling when it changes.
  const close = useCallback(() => {
    setDetailsOpen(false);
    onClose();
  }, [onClose]);
  const backToList = useCallback(() => setDetailsOpen(false), []);

  return (
    <>
      <ModalDialog
        open={open && !detailsOpen}
        onClose={close}
        title={t("attorneyDetails")}
      >
        <span
          id={unavailableId}
          className="sr-only"
        >
          {t("unavailable")}
        </span>
        <ul className="flex flex-col gap-[12px] px-[24px] pb-[24px] pt-[20px]">
          <li>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className={`${ROW_CLASS} bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2`}
            >
              <span className="flex items-center gap-[8px]">
                <Image
                  src="/assets/providers/attorney-chat-icon.png"
                  alt=""
                  width={19}
                  height={16}
                  unoptimized
                  className="h-[16px] w-[19px] shrink-0 object-contain"
                />
                <span
                  className={LABEL_CLASS}
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {t("attorneyDetails")}
                </span>
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <path
                  d="M6 12L10 8L6 4"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>

          <li>
            <button
              type="button"
              disabled
              aria-describedby={unavailableId}
              className={`${ROW_CLASS} cursor-not-allowed bg-[#f8f8f8]`}
            >
              <span className="flex items-center gap-[8px]">
                <Image
                  src="/assets/providers/attorney-chat-icon.png"
                  alt=""
                  width={19}
                  height={16}
                  unoptimized
                  className="h-[16px] w-[19px] shrink-0 object-contain"
                />
                <span
                  className={LABEL_CLASS}
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {t("groupChat")}
                </span>
              </span>
            </button>
          </li>

          <li>
            <button
              type="button"
              disabled
              aria-describedby={unavailableId}
              className={`${ROW_CLASS} cursor-not-allowed bg-[#f8f8f8]`}
            >
              <span className="flex items-center gap-[8px]">
                <Image
                  src="/assets/providers/attorney-change-icon.png"
                  alt=""
                  width={20}
                  height={20}
                  unoptimized
                  className="size-[20px] shrink-0 object-cover"
                />
                <span
                  className={LABEL_CLASS}
                  style={{ fontFamily: "var(--font-nunito-sans)" }}
                >
                  {t("changeAttorney")}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </ModalDialog>

      <ProviderDetailsDialog
        open={open && detailsOpen}
        onClose={backToList}
        ariaLabel={t("attorneyDetails")}
        contact={provider.contact}
      />
    </>
  );
}
