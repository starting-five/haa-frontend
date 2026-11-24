import type { Metadata } from "next";
import { Geist, Nunito_Sans, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { LOCALE_CODES } from "@/i18n/locales";
import { IntakeFlowTracker } from "@/components/analytics/intake-flow-tracker";

export const instant = false;

export function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }));
}

const defaultUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "HelpAfterAccident",
  description: "Hurt in an accident? We'll guide you through every step.",
  icons: {
    icon: "/assets/logo/favicon.svg",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  display: "swap",
  subsets: ["latin"],
});

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <IntakeFlowTracker />
      <div
        className={`${geistSans.variable} ${nunitoSans.variable} ${inter.variable} ${geistSans.className} antialiased bg-gray-100 min-h-screen flex justify-center`}
      >
        <div className="w-full md:max-w-[720px] bg-white relative min-h-screen">{children}</div>
      </div>
    </NextIntlClientProvider>
  );
}
