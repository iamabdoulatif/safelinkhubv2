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
  // QR du paiement, scanné avec l'appareil photo d'un (2e) téléphone → ouvre
  // l'app sans syntaxe. Wave : on encode qr.pay.wave.com (lien universel → app
  // Wave). Autres (Orange/MTN/Moov via PaiementPro) : l'URL de checkout telle
  // quelle (ouvre la page opérateur). Généré côté serveur (hors bundle client).
  const qrTarget = payUrl ? (waveQrHref(payUrl) ?? payUrl) : null;
  let qrDataUrl: string | undefined;
  if (qrTarget) {
    try {
      qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 260 });
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
