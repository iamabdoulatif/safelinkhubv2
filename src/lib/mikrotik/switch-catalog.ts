/**
 * Catalogue des switchs gigabit recommandés quand un port négocie à 100 Mbps
 * (constat `eth-100m` de l'audit) : un switch gigabit évite qu'un vieux switch
 * 100M bride le segment. Data-driven pour rester éditable sans toucher au JSX.
 *
 * Devise paramétrable : passer `currency`/`locale` en FCFA (XOF) et remplacer
 * les fourchettes `priceMin`/`priceMax` suffit — le formatage suit.
 */

export type NetworkSwitch = {
  brand: string;
  model: string;
  /** Fourchette de prix indicative, exprimée dans la devise du catalogue. */
  priceMin: number;
  priceMax: number;
  /** Un seul switch devrait porter recommended:true (mis en avant). */
  recommended: boolean;
  /** Libellé du bandeau (« Recommandé », « Futur-proof »…). */
  badge: string;
  specs: string[];
  /** Quand le choisir — phrase de décision affichée sous les specs. */
  verdict: string;
};

export type SwitchCatalog = {
  /** Code ISO 4217 : "EUR", "XOF" (FCFA), "USD"… */
  currency: string;
  /** Locale de formatage des nombres, ex. "fr-FR". */
  locale: string;
  switches: NetworkSwitch[];
};

export const SWITCH_CATALOG: SwitchCatalog = {
  // Devise locale FCFA. Prix indicatifs marché Afrique de l'Ouest — à ajuster
  // aux tarifs réels des revendeurs (import + marge locale).
  currency: "XOF",
  locale: "fr-FR",
  switches: [
    {
      brand: "TP-Link",
      model: "LS1005G",
      priceMin: 12000,
      priceMax: 18000,
      recommended: true,
      badge: "Recommandé",
      specs: ["5× ports RJ45 1 Gbps", "Non-managé, plug & play", "Alim externe"],
      verdict:
        "À prendre si le MikroTik est en ports gigabit (RB4011, hEX…) et le forfait FAI ≤ 1 Gbps. Le routeur plafonne de toute façon à 1 Gbps/port : le 2,5 G n'apporterait rien.",
    },
    {
      brand: "UGREEN",
      model: "UM106X",
      priceMin: 65000,
      priceMax: 90000,
      recommended: false,
      badge: "Futur-proof",
      specs: ["5× ports RJ45 2,5 Gbps", "1× SFP+ 10 Gbps", "Link Aggregation / VLAN"],
      verdict:
        "À prendre si la fibre dépasse 1 Gbps, si le MikroTik a des ports 2,5 G/SFP+, ou pour un lien inter-switch / NAS 10 G. Sinon c'est payer 5× plus cher sans gain.",
    },
  ],
};

/**
 * Formate une fourchette de prix dans la devise du catalogue, ex. « ≈ 15–20 € ».
 * Le symbole n'apparaît qu'une fois (sur la borne haute) pour la lisibilité.
 */
export function formatPriceRange(sw: NetworkSwitch, catalog: SwitchCatalog = SWITCH_CATALOG): string {
  const number = new Intl.NumberFormat(catalog.locale, { maximumFractionDigits: 0 });
  const currency = new Intl.NumberFormat(catalog.locale, {
    style: "currency",
    currency: catalog.currency,
    maximumFractionDigits: 0,
  });
  if (sw.priceMin === sw.priceMax) return `≈ ${currency.format(sw.priceMax)}`;
  return `≈ ${number.format(sw.priceMin)}–${currency.format(sw.priceMax)}`;
}
