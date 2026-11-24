"use client";

import { ExternalLink, Globe, Mail, MapPin, Phone } from "lucide-react";

import { ModalDialog } from "@/components/ui/modal-dialog";
import { toWebsiteHref, type ProviderContact } from "@/lib/providers";

interface ProviderDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  // Announced in place of a heading — Figma draws this popup with no header.
  ariaLabel: string;
  contact: ProviderContact;
}

// Figma draws the row stroke inside its 52px frame; a CSS border-box adds it on
// top, which pushed the card past the design's 286px.
const ROW_CLASS = "flex h-[52px] items-center gap-[12px] rounded-[12px] border-[0.5px] border-[#E5E7EB] px-[14px]";
const ADDRESS_ROW_CLASS =
  "flex h-[88px] items-center gap-[12px] rounded-[12px] border-[0.5px] border-[#E5E7EB] px-[14px]";
const VALUE_CLASS = "min-w-0 flex-1 truncate text-[15px] font-semibold leading-[18.15px] text-[#1F2937]";
const ADDRESS_VALUE_CLASS =
  "min-w-0 flex-1 whitespace-pre-line text-[15px] font-semibold leading-[18.15px] text-[#1F2937]";
const ICON_BOX = "flex size-[24px] shrink-0 items-center justify-center text-[#cc007e]";

/**
 * The attorney / doctor detail popup — Figma 4182:5033 and 4188:12958, which are
 * the same card with different values. 342px wide, 24px radius, four 52px rows.
 */
export function ProviderDetailsDialog({ open, onClose, ariaLabel, contact }: ProviderDetailsDialogProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      ariaLabel={ariaLabel}
      cardClassName="max-w-[342px]"
      bordered={false}
    >
      <div className="flex flex-col gap-[14px] px-[20px] pt-[16px] pb-[20px]">
        <div className={ADDRESS_ROW_CLASS}>
          <span className={ICON_BOX}>
            <MapPin
              size={20}
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
          <span
            className={ADDRESS_VALUE_CLASS}
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {contact.address}
          </span>
        </div>

        <div className={ROW_CLASS}>
          <span className={ICON_BOX}>
            <Mail
              size={20}
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
          <a
            href={`mailto:${contact.email}`}
            className={`${VALUE_CLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2`}
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {contact.email}
          </a>
        </div>

        <div className={ROW_CLASS}>
          <span className={ICON_BOX}>
            <Globe
              size={20}
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
          <a
            href={toWebsiteHref(contact.website)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 flex-1 items-center gap-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc007e] focus-visible:ring-offset-2"
          >
            <span
              className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-[18.15px] text-[#cc007e] underline"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              {contact.website}
            </span>
            <ExternalLink
              size={14}
              strokeWidth={2}
              absoluteStrokeWidth
              className="shrink-0 text-[#cc007e]"
              aria-hidden="true"
            />
          </a>
        </div>

        {/* Final contact row shows the provider's phone number as plain text.
            Calling remains a separate action on the provider screen. */}
        <div className={ROW_CLASS}>
          <span className={ICON_BOX}>
            <Phone
              size={20}
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
          <span
            className={VALUE_CLASS}
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {contact.phone}
          </span>
        </div>
      </div>
    </ModalDialog>
  );
}
