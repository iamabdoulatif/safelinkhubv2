// Page de retour après le checkout GeniusPay. Elle garde le thème du portail
// et affiche le ticket sans jamais tenter de soumettre le login RouterOS depuis
// le domaine SafeLinkHub.

import { portalThemeFromParams } from "@/lib/portal/theme";
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

  return (
    <PaidStatus
      isError={params.status === "error"}
      orderId={params.orderId?.trim() ?? ""}
      slug={params.slug?.trim() ?? ""}
      theme={theme}
      lane={params.lane === "1"}
      smsSent={params.sms === "1"}
      payUrl={/^https:\/\//i.test(params.pay ?? "") ? params.pay : undefined}
    />
  );
}
