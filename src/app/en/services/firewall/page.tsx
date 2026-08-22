import type { Metadata } from "next";
import { FirewallPageContent } from "../../../services/firewall/page";

export const metadata: Metadata = {
  title: "FireWall | SafeLinkHub",
  description: "Offer in preparation — tell us what you need.",
  alternates: {
    canonical: "/en/services/firewall",
    languages: { fr: "/services/firewall", en: "/en/services/firewall" },
  },
};

export default function FirewallPageEn() {
  return <FirewallPageContent locale="en" />;
}
