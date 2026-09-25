import { isImportedVoucherUseCase } from "@/lib/vouchers/source";

/**
 * État LISIBLE d'un ticket. La colonne `status` de la base vaut « PROVISIONED »
 * pour presque tous (elle dit « posé sur le routeur », rien de plus) : l'état
 * qui compte au guichet se déduit de la première connexion et de l'échéance.
 */
export type TicketState = "unused" | "running" | "expired" | "suspended";

export const TICKET_STATES: { id: TicketState; label: string; tone: string }[] = [
  { id: "unused", label: "Non utilisé", tone: "bg-clay text-ink" },
  { id: "running", label: "En cours", tone: "bg-ok-soft text-ok" },
  { id: "expired", label: "Expiré", tone: "bg-clay text-ink-soft" },
  { id: "suspended", label: "Suspendu", tone: "bg-err-soft text-err" },
];

export function ticketState(
  v: { status: string; expiresAtMs: number | null; firstLogin: string },
  now = Date.now(),
): TicketState {
  if (v.status === "SUSPENDED") return "suspended";
  if (v.status === "EXPIRED" || (v.expiresAtMs !== null && v.expiresAtMs < now)) return "expired";
  if (v.expiresAtMs !== null || v.firstLogin !== "—") return "running";
  return "unused";
}

const ORIGINS: Record<string, string> = {
  "portal sale": "Vente portail",
  "batch create": "Lot généré",
  "roaming batch create": "Lot roaming",
  "roaming named user": "Compte roaming",
};

/** Origine en français ; valeur brute conservée pour ce qui est inconnu. */
export function originLabel(useCase: string): string {
  if (isImportedVoucherUseCase(useCase)) return "Importé";
  return ORIGINS[useCase.trim().toLowerCase()] ?? useCase;
}
