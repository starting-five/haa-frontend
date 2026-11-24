"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import React from "react";
import { LOCALES } from "@/i18n/locales";
import { cn } from "@/lib/utils";

type LocaleSwitcherProps = {
  currentLocale: string;
  className?: string;
  showIcon?: boolean;
};

export default function LocaleSwitcher({ currentLocale, className, showIcon = true }: LocaleSwitcherProps) {
  const [pending, setPending] = React.useState(false);
  const [optimisticLocale, setOptimisticLocale] = React.useState(currentLocale);
  const [open, setOpen] = React.useState(false);

  const t = useTranslations("LocaleSwitcher");
  const router = useRouter();
  const pathname = usePathname();
  const localeLabelMap = Object.fromEntries(LOCALES.map(({ code, label }) => [code, label]));
  const currentLocaleLabel = localeLabelMap[optimisticLocale] ?? optimisticLocale.toUpperCase();

  React.useEffect(() => {
    setOptimisticLocale(currentLocale);
    setPending(false);
    setOpen(false);
  }, [currentLocale]);

  const handleChange = (newLocale: string) => {
    setOptimisticLocale(newLocale);
    setPending(true);
    setOpen(false);
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex min-w-[70px] cursor-pointer items-center justify-center gap-1 rounded border bg-white px-2 py-1 text-sm",
            className
          )}
          disabled={pending}
          aria-disabled={pending}
          aria-label={t("aria_label")}
        >
          {showIcon && <Globe className="h-4 w-4 text-muted-foreground" />}
          {currentLocaleLabel}
        </button>
      </DropdownMenuTrigger>
      {!pending && (
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={optimisticLocale}
            onValueChange={handleChange}
          >
            {LOCALES.map((loc) => (
              <DropdownMenuRadioItem
                key={loc.code}
                value={loc.code}
              >
                {loc.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
