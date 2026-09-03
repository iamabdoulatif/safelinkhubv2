import { PERIOD_PRICE_CENTS } from "@/lib/mikrotik/billing-plans";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";

/**
 * Les tarifs, une seule fois et dans les deux monnaies.
 *
 * Ils étaient écrits DEUX fois sur la page : en prose dans le portefeuille
 * FCFA (« VPN : 1 mois = FCFA 500, 3 mois = FCFA 1,300, 6 mois… ») et en
 * trois cartes dans le bloc Safecoin. Un prix en phrase ne se compare pas —
 * il faut le relire en entier pour trouver la ligne qu'on cherche. Et deux
 * listes séparées, c'est deux occasions de se contredire au prochain
 * changement de prix.
 */
function fcfa(montant: number) {
  return montant.toLocaleString("fr-FR");
}

export default function PricingTable({ rateFcfaPerSc }: { rateFcfaPerSc: number }) {
  const lignes = [
    { label: "Accès VPN · 1 mois", montant: PERIOD_PRICE_CENTS.monthly },
    { label: "Accès VPN · 3 mois", montant: PERIOD_PRICE_CENTS.quarterly },
    { label: "Accès VPN · 6 mois", montant: PERIOD_PRICE_CENTS.semiannual },
    { label: "Accès VPN · 12 mois", montant: PERIOD_PRICE_CENTS.yearly },
    { label: "Auto-Setup · avec container", montant: autoSetupFeeCentsFor(true) },
    { label: "Auto-Setup · sans container", montant: autoSetupFeeCentsFor(false) },
  ];

  return (
    <section className="rounded-xl border border-line bg-paper p-4 sm:p-6">
      <h2 className="font-display text-base font-bold text-ink">Tarifs</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Payables indifféremment depuis le portefeuille FCFA ou en Safecoin.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-ink-soft">
            <th scope="col" className="py-2 font-semibold">
              Prestation
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              FCFA
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Safecoin
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.label} className="border-b border-line-soft last:border-0">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                {ligne.label}
              </th>
              <td className="py-2.5 text-right tabular-nums text-ink">{fcfa(ligne.montant)}</td>
              <td className="py-2.5 text-right tabular-nums text-ink-soft">
                {Math.ceil(ligne.montant / rateFcfaPerSc)} SC
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
