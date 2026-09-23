// TEMPORAIRE — configuration de la porte de monétisation manuelle de
// l'Auto-Setup. Module "plain" (pas de "use server") : les helpers purs et
// les libellés sont importables côté client (modal) ; getAutoSetupGateConfig()
// lit process.env et n'est appelé QUE côté serveur (la page passe les valeurs
// utiles au client en props).
// TODO: Remplacer par système de paiement intégré.

export type MikrotikKind = "container" | "hotspotOnly";

export type PaymentMethodId = "wave" | "orange" | "moov" | "mtn";

export const PAYMENT_METHODS: { id: PaymentMethodId; label: string }[] = [
  { id: "wave", label: "Wave" },
  { id: "orange", label: "Orange Money" },
  { id: "moov", label: "Moov Money" },
  { id: "mtn", label: "MTN MoMo" },
];

export function isPaymentMethod(value: string): value is PaymentMethodId {
  return PAYMENT_METHODS.some((m) => m.id === value);
}

/** Valeurs par défaut (surchargées par l'environnement, voir plus bas). */
const DEFAULTS = {
  priceWithContainerFcfa: 15000,
  priceWithoutContainerFcfa: 10000,
  // Option dual WAN (répartition PCC de deux liens Starlink + bascule
  // automatique) : un supplément au tarif de base, jamais un second paiement.
  dualWanOptionFcfa: 25000,
  // Numéro WhatsApp de l'admin, format international sans "+" ni espaces
  // (attendu par l'API wa.me). +225 07 09 10 05 52 → 2250709100552.
  whatsappNumber: "2250709100552",
} as const;

export type AutoSetupGateConfig = {
  priceWithContainerFcfa: number;
  priceWithoutContainerFcfa: number;
  dualWanOptionFcfa: number;
  whatsappNumber: string;
  /** Destinataire de l'email d'autorisation (serveur uniquement). */
  adminEmail: string | null;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Lit la config depuis l'environnement. À n'appeler que côté serveur. */
export function getAutoSetupGateConfig(): AutoSetupGateConfig {
  return {
    priceWithContainerFcfa: parsePositiveInt(
      process.env.AUTO_SETUP_PRICE_WITH_CONTAINER,
      DEFAULTS.priceWithContainerFcfa,
    ),
    priceWithoutContainerFcfa: parsePositiveInt(
      process.env.AUTO_SETUP_PRICE_WITHOUT_CONTAINER,
      DEFAULTS.priceWithoutContainerFcfa,
    ),
    dualWanOptionFcfa: parsePositiveInt(
      process.env.AUTO_SETUP_PRICE_DUAL_WAN,
      DEFAULTS.dualWanOptionFcfa,
    ),
    whatsappNumber:
      (process.env.AUTO_SETUP_WHATSAPP_NUMBER || DEFAULTS.whatsappNumber).replace(/[^0-9]/g, ""),
    adminEmail: process.env.AUTO_SETUP_ADMIN_EMAIL || null,
  };
}

export type AutoSetupPrices = Pick<
  AutoSetupGateConfig,
  "priceWithContainerFcfa" | "priceWithoutContainerFcfa" | "dualWanOptionFcfa"
>;

/**
 * Tarif applicable en FCFA : la capacité container donne le socle, l'option
 * dual WAN s'y ajoute. UN SEUL montant, donc un seul paiement pour toute
 * l'installation — et c'est ce montant, enregistré sur l'autorisation, qui
 * prouve ensuite que l'option a bien été payée (voir dualWanPaidFor).
 */
export function autoSetupPriceFcfa(
  config: AutoSetupPrices,
  supportsContainers: boolean,
  dualWan = false,
): number {
  const base = supportsContainers ? config.priceWithContainerFcfa : config.priceWithoutContainerFcfa;
  return dualWan ? base + config.dualWanOptionFcfa : base;
}

/**
 * Une autorisation payée couvre-t-elle l'option dual WAN ? On compare le
 * montant enregistré au socle de SON type de routeur : rien de nouveau à
 * stocker, et un client qui paie le tarif simple puis coche « deux liens » sur
 * l'écran ne passe pas.
 */
export function dualWanPaidFor(
  config: AutoSetupPrices,
  authorization: { amountFcfa: number; supportsContainers: boolean },
): boolean {
  return (
    authorization.amountFcfa >=
    autoSetupPriceFcfa(config, authorization.supportsContainers, true)
  );
}

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

export function mikrotikKindLabel(supportsContainers: boolean): string {
  return supportsContainers ? "Avec container" : "Sans container (ex : RB951)";
}

/** Lien wa.me pré-rempli. `number` doit être en format international sans "+". */
export function buildWhatsappLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
