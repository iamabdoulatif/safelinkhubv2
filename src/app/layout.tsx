import type { Metadata } from "next";
import "./globals.css";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";
import SupportChat from "@/components/support/SupportChat";
import { getMarketingSettings } from "@/lib/marketing/queries";
import { isMistralConfigured } from "@/lib/ai/mistral";

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
  const assistantActif = isMistralConfigured();

  return (
    <html lang="fr" className="h-full antialiased overflow-x-hidden">
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <AnalyticsScripts settings={marketing} />
        {children}
        {/* Monté UNE fois pour tout le site public : le composant se retire
            lui-même de l'administration et du portail captif, d'après le
            chemin. Sans clé Mistral configurée, il n'est pas rendu du tout —
            un bouton qui ouvre une conversation morte vaut moins que pas de
            bouton. */}
        {assistantActif && <SupportChat />}
      </body>
    </html>
  );
}
