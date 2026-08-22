import type { Metadata } from "next";
import { TrainingPageContent } from "../../formations/page";

export const metadata: Metadata = {
  title: "Training | SafeLinkHub",
  description:
    "Paths and guides to install, secure and monetise a MikroTik Wi-Fi hotspot.",
  alternates: { canonical: "/en/formations", languages: { fr: "/formations", en: "/en/formations" } },
};

export default function TrainingPageEn() {
  return <TrainingPageContent locale="en" />;
}
