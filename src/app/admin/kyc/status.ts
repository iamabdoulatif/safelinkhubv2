/** Libellés et teintes des statuts KYC — un seul endroit, pour que la liste et
 *  la fiche ne puissent pas nommer le même état différemment. */
export const KYC_STATUS_LABELS: Record<string, string> = {
  not_started: "Non commencé",
  documents_sent: "Pièces envoyées",
  agreement_signed: "Accord signé",
  under_review: "En attente",
  approved: "Validé",
  rejected: "Refusé",
};

export function statusTone(status: string): string {
  if (status === "approved") return "bg-brand text-slate-deep";
  if (status === "rejected") return "bg-err-soft text-err";
  if (status === "under_review") return "bg-clay text-brand-deep";
  return "bg-clay text-ink-soft";
}
