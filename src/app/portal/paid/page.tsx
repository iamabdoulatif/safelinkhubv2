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
    />
  );
}
