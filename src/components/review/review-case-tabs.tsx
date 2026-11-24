"use client";

import { useState, type ReactNode } from "react";

type ReviewTab = "summary" | "story" | "documents";

export function ReviewCaseTabs({
  labels,
  ariaLabel,
  summary,
  story,
  documents,
}: {
  labels: Record<ReviewTab, string>;
  ariaLabel: string;
  summary: ReactNode;
  story: ReactNode;
  documents: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("summary");
  const panels: Record<ReviewTab, ReactNode> = { summary, story, documents };

  return (
    <div className="mt-3">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="grid grid-cols-3 border-b border-neutral-200"
      >
        {(["summary", "story", "documents"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`review-tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls="review-tab-panel"
            onClick={() => setActiveTab(tab)}
            className={`min-h-11 border-b-2 px-2 text-[13px] font-semibold transition-colors ${
              activeTab === tab ? "border-[#cc007e] text-[#cc007e]" : "border-transparent text-neutral-600"
            }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="review-tab-panel"
        aria-labelledby={`review-tab-${activeTab}`}
        className="min-w-0"
      >
        {panels[activeTab]}
      </div>
    </div>
  );
}
