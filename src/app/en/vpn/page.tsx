import type { Metadata } from "next";
import { VpnPageContent } from "../../vpn/page";

export const metadata: Metadata = {
  title: "VPN and remote access | SafeLinkHub",
  description:
    "Encrypted tunnel to your MikroTiks: WinBox, WebFig, SSH and MikHmon, even behind a CGNAT. Real prices.",
  alternates: { canonical: "/en/vpn", languages: { fr: "/vpn", en: "/en/vpn" } },
};

export default function VpnPageEn() {
  return <VpnPageContent locale="en" />;
}
