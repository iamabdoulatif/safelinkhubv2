import type { Metadata } from "next";
import { HotspotPageContent } from "../../../services/hotspot/page";

export const metadata: Metadata = {
  title: "Wi-Fi hotspot | SafeLinkHub",
  description: "Branded captive portal, tickets, mobile money collection and monitoring, on your own MikroTiks.",
  alternates: {
    canonical: "/en/services/hotspot",
    languages: { fr: "/services/hotspot", en: "/en/services/hotspot" },
  },
};

export default function HotspotPageEn() {
  return <HotspotPageContent locale="en" />;
}
