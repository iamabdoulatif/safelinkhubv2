import type { Metadata } from "next";
import { ServicesPageContent } from "../../services/page";

export const metadata: Metadata = {
  title: "Services | SafeLinkHub",
  description:
    "MikroTik provisioning, captive portal, mobile money, monitoring: the detail of SafeLinkHub services.",
  alternates: { canonical: "/en/services", languages: { fr: "/services", en: "/en/services" } },
};

export default function ServicesPageEn() {
  return <ServicesPageContent locale="en" />;
}
