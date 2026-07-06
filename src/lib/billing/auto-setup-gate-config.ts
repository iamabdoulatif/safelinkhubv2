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
  // Numéro WhatsApp de l'admin, format international sans "+" ni espaces
  // (attendu par l'API wa.me). +225 07 09 10 05 52 → 2250709100552.
  whatsappNumber: "2250709100552",
} as const;

export type AutoSetupGateConfig = {
  priceWithContainerFcfa: number;
  priceWithoutContainerFcfa: number;
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
    whatsappNumber:
      (process.env.AUTO_SETUP_WHATSAPP_NUMBER || DEFAULTS.whatsappNumber).replace(/[^0-9]/g, ""),
    adminEmail: process.env.AUTO_SETUP_ADMIN_EMAIL || null,
  };
}

/** Tarif applicable en FCFA selon la capacité container du routeur. */
export function autoSetupPriceFcfa(
  config: Pick<AutoSetupGateConfig, "priceWithContainerFcfa" | "priceWithoutContainerFcfa">,
  supportsContainers: boolean,
): number {
  return supportsContainers ? config.priceWithContainerFcfa : config.priceWithoutContainerFcfa;
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
