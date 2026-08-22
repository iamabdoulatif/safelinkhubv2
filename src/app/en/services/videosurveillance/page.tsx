import type { Metadata } from "next";
import { CameraPageContent } from "../../../services/videosurveillance/page";

export const metadata: Metadata = {
  title: "Security cameras | SafeLinkHub",
  description: "Offer in preparation — tell us what you need.",
  alternates: {
    canonical: "/en/services/videosurveillance",
    languages: { fr: "/services/videosurveillance", en: "/en/services/videosurveillance" },
  },
};

export default function CameraPageEn() {
  return <CameraPageContent locale="en" />;
}
