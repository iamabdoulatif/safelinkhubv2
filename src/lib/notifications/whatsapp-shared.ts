// Bouts PURS de la diffusion WhatsApp — AUCUN import de base de données, pour
// que le composant client (WhatsappBroadcast.tsx) puisse les importer sans
// tirer `@/lib/db` (et donc `pg`) dans le bundle navigateur. Le gros du module
// (requêtes, envoi API) vit dans whatsapp-broadcast.ts, côté serveur seul.

export type WhatsappRecipient = {
  orgId: string;
  orgName: string;
  /** Numéro international en chiffres (ex. « 2250788198819 »), ou null si absent. */
  digits: string | null;
  /** Affichage lisible (ex. « +225 07 88 19 88 19 »). */
  display: string | null;
  mikhmonRouters: number;
};

/** « 07 88 19 88 19 » + indicatif « +225 » → « 2250788198819 ». */
export function toInternationalDigits(number: string | null, dialCode: string | null): string | null {
  const raw = (number ?? "").replace(/\D/g, "");
  if (!raw) return null;
  const dial = (dialCode ?? "").replace(/\D/g, "");
  if (!dial) return raw;
  return raw.startsWith(dial) ? raw : dial + raw;
}

/** Message par défaut (sûr) : renvoie au tableau de bord, pas de mot de passe en clair. */
export function defaultBroadcastMessage(orgName: string): string {
  return (
    `Bonjour ${orgName}, mise à jour SafeLinkHub : votre accès MikHmon a été sécurisé. ` +
    `Identifiant : mikhmon. Votre nouveau mot de passe est dans votre tableau de bord ` +
    `(Réseau › Routeurs › Maintenance › Identifiants MikHmon). — SafeLinkHub`
  );
}

/** Lien wa.me prêt à envoyer. */
export function waMeLink(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
