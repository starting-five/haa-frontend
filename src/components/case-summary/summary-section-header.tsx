"use client";

import { Pencil } from "lucide-react";

interface SummarySectionHeaderProps {
  title: string;
  // absent when the section cannot be changed here — the title stays, the pencil goes
  onEdit?: () => void;
  editLabel?: string;
}

// The uppercase label above each block of the case summary, shared by the
// intake Review screen and Case Summary. The whole row is the edit control.
export function SummarySectionHeader({ title, onEdit, editLabel }: SummarySectionHeaderProps) {
  const label = (
    <p
      className="text-[12px] font-semibold uppercase text-[#6e6e73]"
      style={{ fontFamily: "var(--font-inter)" }}
    >
      {title}
    </p>
  );

  if (!onEdit) return <div className="flex w-full items-center justify-between text-left">{label}</div>;

  return (
    <button
      type="button"
      aria-label={editLabel}
      onClick={onEdit}
      className="flex w-full items-center justify-between text-left"
    >
      {label}
      <Pencil
        size={14}
        className="text-[#cc007e]"
      />
    </button>
  );
}
