"use client";

import { FileText, Film, Image as ImageIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

import { documentKind, type DocumentKind } from "@/lib/intake-documents";
import type { EvidenceCategory, UploadedFile } from "@/types/intake";

// One picture of a document, wherever a document is listed.
//
// The picture is the thumbnail the evidence screen made when the file went up
// — a ~96px WebP kept beside the record. It is not fetched: the bucket has no
// read policy, so a patient's own session is answered `NoSuchKey` even for an
// object they just uploaded, and only the backend's service role can read one
// back. Drawing a row must not depend on that, so a document with no cached
// thumbnail — a PDF, or an image from a session that predates the cache —
// shows what kind of thing it is instead.

const KIND_ICONS: Record<DocumentKind, LucideIcon> = {
  image: ImageIcon,
  pdf: FileText,
  // Video cannot be uploaded yet. A record that somehow holds one still has to
  // draw, and it draws as media rather than as something playable.
  video: Film,
  other: FileText,
};

const SIZES = {
  24: { box: "size-[24px] rounded-[6px]", icon: 12 },
  40: { box: "size-[40px] rounded-[10px]", icon: 18 },
} as const;

interface DocumentThumbnailProps {
  document: UploadedFile;
  /** The cached thumbnail for this object key, if one was made. */
  preview?: string;
  category: EvidenceCategory | null;
  size?: keyof typeof SIZES;
}

export function DocumentThumbnail({ document, preview, category, size = 40 }: DocumentThumbnailProps) {
  const t = useTranslations("DocumentPreview");
  const tCategory = useTranslations("IntakeEvidence");
  const [failed, setFailed] = useState(false);

  const kind = documentKind(document);
  const Icon = KIND_ICONS[kind];
  const { box, icon } = SIZES[size];
  const showImage = Boolean(preview) && kind === "image" && !failed;

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border-[0.5px] border-[#e5e7eb] bg-white text-[#8e8e93] ${box}`}
    >
      {/* Drawn underneath, so a thumbnail that is still decoding — or that
          turns out to be unreadable — leaves something in its place rather
          than a gap or a broken-image glyph. */}
      <Icon
        size={icon}
        aria-hidden="true"
      />
      {showImage && (
        <Image
          src={preview as string}
          alt={t("previewOf", { label: category ? tCategory(`category.${category}`) : document.fileName })}
          width={size * 2}
          height={size * 2}
          unoptimized
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}
