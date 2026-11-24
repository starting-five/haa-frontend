import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

type FooterProps = {
  locale: string;
};

export function Footer({ locale }: FooterProps) {
  const t = useTranslations("Footer");

  return (
    <footer className="px-5 py-7 pb-[calc(28px_+_env(safe-area-inset-bottom))] text-sm text-[#6e6e73]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-wrap justify-between gap-4">
        <Link
          href={`/${locale}`}
          aria-label={t("homeLabel")}
        >
          <Image
            src="/assets/logo/black-logo.png"
            alt={t("logoAlt")}
            width={210}
            height={42}
            className="block h-7 w-auto"
          />
        </Link>
        <div className="flex flex-wrap gap-4">
          <a href="mailto:contact@helpafteraccident.com">{t("contact")}</a>
          {/* --> Once we get the actual policy/terms this is should to be uncommented. 
          <Link href={`/${locale}/privacy-policy`}>Privacy</Link>
          <Link href={`/${locale}/terms`}>Terms</Link> */}
          <span>&copy; 2026</span>
        </div>
      </div>
    </footer>
  );
}
