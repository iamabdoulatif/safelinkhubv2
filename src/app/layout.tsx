import type { Metadata } from "next";
import "./globals.css";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";
import { getMarketingSettings } from "@/lib/marketing/queries";

export const metadata: Metadata = {
  title: "SafeLinkHub | Mobile Money Hotspot",
  description:
    "SafeLinkHub is the most advanced Hotspot and ISP Automation Platform, built to manage, automate, and grow any network.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const marketing = await getMarketingSettings();

  return (
    <html lang="fr" className="h-full antialiased overflow-x-hidden">
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <AnalyticsScripts settings={marketing} />
        {children}
      </body>
    </html>
  );
}
