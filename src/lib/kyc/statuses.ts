/** Libellés, teintes et files du parcours KYC.
 *
 *  Un seul endroit, pour que la liste, la fiche et la barre latérale ne
 *  puissent pas nommer le même état différemment. Ce module reste SANS
 *  « server-only » : la barre latérale est un composant client et a besoin
 *  des files pour afficher son sous-menu.
 */
export const KYC_STATUS_LABELS: Record<string, string> = {
  not_started: "Non commencé",
  documents_sent: "Pièces envoyées",
  agreement_signed: "Accord signé",
  under_review: "En attente",
  approved: "Validé",
  rejected: "Refusé",
};

// Mêmes quatre statuts que le reste du SaaS (ok / info / warn / err) : le
// lime plein de « Validé » se confondait avec un bouton d'action.
export function statusTone(status: string): string {
  if (status === "approved") return "bg-ok-soft text-ok";
  if (status === "rejected") return "bg-err-soft text-err";
  if (status === "under_review") return "bg-warn-soft text-warn";
  if (status === "documents_sent" || status === "agreement_signed") return "bg-info-soft text-info";
  return "bg-clay text-ink-soft";
}

/**
 * Files exposées comme onglets ET comme sous-menu, dans l'ordre d'urgence
 * pour l'examinateur.
 *
 * « Pièces envoyées » a sa propre file : ce sont des dossiers où l'opérateur
 * a transmis ses papiers mais n'a pas signé l'accord. Sans file dédiée ils
 * n'apparaissaient que dans « Tous » — donc nulle part en pratique.
 */
export const KYC_TABS = [
  { key: "under_review", label: "En attente" },
  { key: "documents_sent", label: "Pièces envoyées" },
  { key: "approved", label: "Validés" },
  { key: "rejected", label: "Refusés" },
  { key: "not_started", label: "Non commencés" },
  { key: "all", label: "Tous" },
] as const;

export type KycTab = (typeof KYC_TABS)[number]["key"];

export const isKycTab = (v: string): v is KycTab => KYC_TABS.some((t) => t.key === v);
