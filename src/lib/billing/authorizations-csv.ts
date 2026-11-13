// Export CSV des autorisations payantes (Auto-Setup / Accès distant VPN) pour
// le dashboard super-admin. Chaque ligne porte la référence GeniusPay et les
// informations du client (nom, e-mail, téléphone) — c'est le récapitulatif que
// réclament GeniusPay et ses partenaires de paiement. Le téléphone n'est pas
// stocké sur la demande : l'appelant le joint depuis la fiche utilisateur.

export type AuthorizationCsvRow = {
  createdAt: Date;
  paymentReference: string | null;
  requesterName: string;
  requesterEmail: string;
  /** Téléphone international (indicatif + numéro), ou null si inconnu. */
  phone: string | null;
  /** Libellé spécifique : « Type » pour l'Auto-Setup, « Service — Durée » pour le VPN. */
  detail: string;
  routerName: string | null;
  amountFcfa: number;
  paymentMethod: string;
  status: string;
};

/** Échappe une cellule CSV (séparateur « ; », guillemets, sauts de ligne). */
function cell(v: string | number): string {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Construit le CSV (séparateur « ; », une ligne d'en-tête). `detailHeader`
 * nomme la colonne spécifique (ex. « Type » ou « Service »).
 */
export function authorizationsCsv(detailHeader: string, rows: AuthorizationCsvRow[]): string {
  const lines = [
    [
      "Date",
      "Référence GeniusPay",
      "Nom",
      "Email",
      "Téléphone",
      detailHeader,
      "Routeur",
      "Montant FCFA",
      "Moyen",
      "Statut",
    ].join(";"),
  ];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.paymentReference ?? "",
        r.requesterName,
        r.requesterEmail,
        r.phone ?? "",
        r.detail,
        r.routerName ?? "",
        r.amountFcfa,
        r.paymentMethod,
        r.status,
      ]
        .map(cell)
        .join(";"),
    );
  }
  return lines.join("\n");
}
