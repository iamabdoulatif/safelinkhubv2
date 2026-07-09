// Page de retour après le checkout GeniusPay (success_url / error_url de
// /api/portal/[slug]/initiate). Ouverte dans l'onglet du checkout. Elle sonde
// le statut de la commande et AFFICHE le code d'accès dès qu'il est prêt (en
// plus de l'auto-login joué par l'onglet du portail resté ouvert). Le client
// peut donc lire/recopier son code même si l'onglet WiFi a été fermé.

import PaidStatus from "./PaidStatus";

export default async function PortalPaidPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; orderId?: string; slug?: string }>;
}) {
  const { status, orderId, slug } = await searchParams;
  return (
    <PaidStatus
      isError={status === "error"}
      orderId={orderId ?? ""}
      slug={slug ?? ""}
    />
  );
}
