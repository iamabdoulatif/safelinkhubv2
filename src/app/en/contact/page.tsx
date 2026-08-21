import type { Metadata } from "next";
import { ContactPageContent } from "../../contact/page";

export const metadata: Metadata = {
  title: "Contact | SafeLinkHub",
  description: "Contact SafeLinkHub for product questions, partnerships and pre-sales support.",
  alternates: { canonical: "/en/contact", languages: { fr: "/contact", en: "/en/contact" } },
};

export default function ContactPageEn() {
  return <ContactPageContent locale="en" />;
}
