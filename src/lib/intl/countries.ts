export type Country = { name: string; iso2: string; dialCode: string };

// Primary go-to-market countries, in the operator's priority order. These
// appear first in every selector so the overwhelming majority of signups
// don't have to scroll. COUNTRIES[0] (Côte d'Ivoire) is the registration
// default — keep it first.
const PRIMARY_MARKET_COUNTRIES: Country[] = [
  { name: "Côte d'Ivoire", iso2: "CI", dialCode: "+225" },
  { name: "Bénin", iso2: "BJ", dialCode: "+229" },
  { name: "Sénégal", iso2: "SN", dialCode: "+221" },
  { name: "Burkina Faso", iso2: "BF", dialCode: "+226" },
  { name: "Mali", iso2: "ML", dialCode: "+223" },
  { name: "Togo", iso2: "TG", dialCode: "+228" },
  { name: "Cameroun", iso2: "CM", dialCode: "+237" },
  { name: "Rép. du Congo", iso2: "CG", dialCode: "+242" },
  { name: "Gabon", iso2: "GA", dialCode: "+241" },
  { name: "RD Congo", iso2: "CD", dialCode: "+243" },
  { name: "Kenya", iso2: "KE", dialCode: "+254" },
  { name: "Rwanda", iso2: "RW", dialCode: "+250" },
  { name: "Ouganda", iso2: "UG", dialCode: "+256" },
  { name: "Sierra Leone", iso2: "SL", dialCode: "+232" },
  { name: "Guinée", iso2: "GN", dialCode: "+224" },
  { name: "Niger", iso2: "NE", dialCode: "+227" },
  { name: "Guinée-Bissau", iso2: "GW", dialCode: "+245" },
  { name: "Ghana", iso2: "GH", dialCode: "+233" },
  { name: "Nigeria", iso2: "NG", dialCode: "+234" },
  { name: "Zambie", iso2: "ZM", dialCode: "+260" },
  { name: "Tanzanie", iso2: "TZ", dialCode: "+255" },
  { name: "Malawi", iso2: "MW", dialCode: "+265" },
  { name: "Mozambique", iso2: "MZ", dialCode: "+258" },
];

// Rest of Africa — still selectable (aucune org existante n'est retirée), just
// listed after the priority markets. No European/American/Asian markets, this
// SaaS only sells on the continent.
const OTHER_COUNTRIES: Country[] = [
  { name: "Tchad", iso2: "TD", dialCode: "+235" },
  { name: "République centrafricaine", iso2: "CF", dialCode: "+236" },
  { name: "Mauritanie", iso2: "MR", dialCode: "+222" },
  { name: "Liberia", iso2: "LR", dialCode: "+231" },
  { name: "Gambie", iso2: "GM", dialCode: "+220" },
  { name: "Cap-Vert", iso2: "CV", dialCode: "+238" },
  { name: "Guinée équatoriale", iso2: "GQ", dialCode: "+240" },
  { name: "Maroc", iso2: "MA", dialCode: "+212" },
  { name: "Algérie", iso2: "DZ", dialCode: "+213" },
  { name: "Tunisie", iso2: "TN", dialCode: "+216" },
  { name: "Libye", iso2: "LY", dialCode: "+218" },
  { name: "Égypte", iso2: "EG", dialCode: "+20" },
  { name: "Soudan", iso2: "SD", dialCode: "+249" },
  { name: "Burundi", iso2: "BI", dialCode: "+257" },
  { name: "Éthiopie", iso2: "ET", dialCode: "+251" },
  { name: "Somalie", iso2: "SO", dialCode: "+252" },
  { name: "Afrique du Sud", iso2: "ZA", dialCode: "+27" },
  { name: "Zimbabwe", iso2: "ZW", dialCode: "+263" },
  { name: "Madagascar", iso2: "MG", dialCode: "+261" },
  { name: "Botswana", iso2: "BW", dialCode: "+267" },
  { name: "Namibie", iso2: "NA", dialCode: "+264" },
  { name: "Angola", iso2: "AO", dialCode: "+244" },
  { name: "Autre pays africain", iso2: "XX", dialCode: "+" },
];

export const COUNTRIES: Country[] = [...PRIMARY_MARKET_COUNTRIES, ...OTHER_COUNTRIES];

export function findCountry(iso2: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso2 === iso2);
}

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - "A".charCodeAt(0);

/** Computed from the ISO2 code so every entry gets a flag without hardcoding emoji. */
export function countryFlag(iso2: string): string {
  if (iso2.length !== 2 || iso2 === "XX") return "🌍";
  const codePoints = iso2
    .toUpperCase()
    .split("")
    .map((char) => char.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET);
  return String.fromCodePoint(...codePoints);
}
