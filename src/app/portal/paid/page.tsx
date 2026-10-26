// Page de retour après le checkout GeniusPay. Elle garde le thème du portail
// et affiche le ticket sans jamais tenter de soumettre le login RouterOS depuis
// le domaine SafeLinkHub.

import QRCode from "qrcode";
import { portalThemeFromParams } from "@/lib/portal/theme";
import { waveQrHref } from "@/lib/portal/browser-href";
import PaidStatus from "./PaidStatus";

type PaidSearchParams = {
  status?: string;
  orderId?: string;
  slug?: string;
  accent?: string;
  surface?: string;
  text?: string;
  /** Voie de paiement ouverte (mini-navigateur captif) : consignes en tête. */
  lane?: string;
  sms?: string;
  pay?: string;
};

export default async function PortalPaidPage({
  searchParams,
}: {
  searchParams: Promise<PaidSearchParams>;
}) {
  const params = await searchParams;
  const theme = portalThemeFromParams(params);

  const payUrl = /^https:\/\//i.test(params.pay ?? "") ? params.pay : undefined;
  // QR du checkout Wave (lien universel qr.pay.wave.com) : un SECOND téléphone,
  // avec ses propres données, le scanne et paie dans son app Wave — la vraie
  // sortie quand l'app ne s'ouvre pas depuis la fenêtre Wi-Fi captive. Généré
  // côté serveur pour ne pas alourdir le bundle client.
  const waveQr = payUrl ? waveQrHref(payUrl) : null;
  let qrDataUrl: string | undefined;
  if (waveQr) {
    try {
      qrDataUrl = await QRCode.toDataURL(waveQr, { margin: 1, width: 240 });
    } catch {
      qrDataUrl = undefined;
    }
  }

  return (
    <PaidStatus
      isError={params.status === "error"}
      orderId={params.orderId?.trim() ?? ""}
      slug={params.slug?.trim() ?? ""}
      theme={theme}
      lane={params.lane === "1"}
      smsSent={params.sms === "1"}
      payUrl={payUrl}
      qrDataUrl={qrDataUrl}
    />
  );
}
