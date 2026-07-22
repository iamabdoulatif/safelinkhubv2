/**
 * Règles de reprise de l'envoi SMS d'une commande portail.
 *
 * Le SMS est un effet secondaire du paiement : une erreur de transport ne doit
 * ni annuler l'accès déjà créé, ni être oubliée. La fenêtre évite qu'un portail
 * qui sonde et le cron de rattrapage émettent le même SMS en parallèle.
 */
export const PORTAL_SMS_RETRY_DELAY_MS = 60_000;

export type PortalSmsStatus = "pending" | "failed" | "sent";

export function shouldAttemptPortalSms(params: {
  status: string | null | undefined;
  lastAttemptAt: Date | null | undefined;
  now?: Date;
}): boolean {
  if (params.status === "sent") return false;
  if (!params.lastAttemptAt) return true;
  const now = (params.now ?? new Date()).getTime();
  return now - params.lastAttemptAt.getTime() >= PORTAL_SMS_RETRY_DELAY_MS;
}
