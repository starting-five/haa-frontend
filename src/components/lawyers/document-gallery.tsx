"use client";

import { Download, FileText } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";

export type LawyerDocumentItem = {
  id: string;
  fileName: string;
  sizeLabel: string;
  /** Decided by the backend from the type Storage serves: image and pdf open inline, file downloads. */
  kind: "image" | "pdf" | "file";
  /** The page's own route for the file, when it can be opened; never a Storage URL. */
  url: string | null;
};

const isViewableImage = (item: LawyerDocumentItem) => item.kind === "image" && Boolean(item.url);

export type LawyerDocumentGroup = {
  key: string;
  label: string;
  items: LawyerDocumentItem[];
};

export function LawyerDocumentGallery({ groups }: { groups: LawyerDocumentGroup[] }) {
  const t = useTranslations("LawyerReview");
  const tCommon = useTranslations("Common");
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const hasItems = useMemo(() => groups.some((group) => group.items.length > 0), [groups]);
  const previewableItems = useMemo(() => groups.flatMap((group) => group.items).filter(isViewableImage), [groups]);
  const active = activeIndex >= 0 ? (previewableItems[activeIndex] ?? null) : null;

  const openItem = (item: LawyerDocumentItem) => {
    if (!isViewableImage(item)) return;
    const index = previewableItems.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) setActiveIndex(index);
  };

  const closeViewer = () => setActiveIndex(-1);

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < previewableItems.length - 1;

  const goPrev = () => {
    if (canGoPrev) setActiveIndex((current) => current - 1);
  };

  const goNext = () => {
    if (canGoNext) setActiveIndex((current) => current + 1);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (startX === null || startY === null) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    // Horizontal gesture only: ignore mostly vertical drags.
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < 0) {
      goNext();
      return;
    }
    goPrev();
  };

  if (!hasItems) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-600">
        {t("documentsNone")}
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {groups.map((group) => (
          <div
            key={group.key}
            className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">
              {group.label} ({group.items.length})
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {group.items.map((item) =>
                isViewableImage(item) ? (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    className="rounded-lg border border-neutral-200 bg-white p-2 text-left"
                  >
                    <div className="relative h-24 overflow-hidden rounded-md bg-neutral-100">
                      <Image
                        src={item.url ?? ""}
                        alt={item.fileName}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-semibold text-neutral-900">{item.fileName}</p>
                    <p className="mt-1 text-[11px] text-neutral-600">{item.sizeLabel}</p>
                  </button>
                ) : item.url ? (
                  // A new tab with no opener and no referrer. The file comes from
                  // the app's document route, which checks the link every time.
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${item.kind === "pdf" ? t("viewDocument") : t("downloadDocument")}: ${item.fileName}`}
                    className="flex flex-col rounded-lg border border-neutral-200 bg-white p-2 text-left hover:border-[#cc007e]"
                  >
                    <div className="flex h-24 items-center justify-center rounded-md bg-neutral-100 text-neutral-500">
                      {item.kind === "pdf" ? (
                        <FileText
                          aria-hidden
                          className="h-8 w-8"
                        />
                      ) : (
                        <Download
                          aria-hidden
                          className="h-8 w-8"
                        />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-semibold text-neutral-900">{item.fileName}</p>
                    <p className="mt-1 text-[11px] text-neutral-600">{item.sizeLabel}</p>
                    <p className="mt-1 text-[11px] font-bold text-[#cc007e]">
                      {item.kind === "pdf" ? t("viewDocument") : t("downloadDocument")}
                    </p>
                  </a>
                ) : (
                  <div
                    key={item.id}
                    className="rounded-lg border border-neutral-200 bg-white p-2 text-left"
                  >
                    <div className="flex h-24 items-center justify-center rounded-md bg-neutral-100 px-2 text-center text-xs font-semibold text-neutral-500">
                      {t("documentTile")}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-semibold text-neutral-900">{item.fileName}</p>
                    <p className="mt-1 text-[11px] text-neutral-600">{item.sizeLabel}</p>
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {active?.url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white px-3 py-2 text-sm font-bold text-neutral-900"
            onClick={closeViewer}
          >
            {tCommon("close")}
          </button>

          <button
            type="button"
            className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/65 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-35 sm:left-4 sm:h-14 sm:w-14"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label={t("previousDocument")}
          >
            &lt;
          </button>

          <button
            type="button"
            className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/65 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-35 sm:right-4 sm:h-14 sm:w-14"
            onClick={goNext}
            disabled={!canGoNext}
            aria-label={t("nextDocument")}
          >
            &gt;
          </button>

          <div className="relative h-[85vh] w-full max-w-5xl">
            <Image
              src={active.url}
              alt={active.fileName}
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
