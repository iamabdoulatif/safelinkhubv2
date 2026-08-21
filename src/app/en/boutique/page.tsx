import type { Metadata } from "next";
import { BoutiquePageContent } from "../../boutique/page";

export const metadata: Metadata = {
  title: "Shop coming soon | SafeLinkHub",
  description: "The SafeLinkHub equipment shop is coming soon.",
  alternates: { canonical: "/en/boutique", languages: { fr: "/boutique", en: "/en/boutique" } },
};

export default function BoutiquePageEn() {
  return <BoutiquePageContent locale="en" />;
}
