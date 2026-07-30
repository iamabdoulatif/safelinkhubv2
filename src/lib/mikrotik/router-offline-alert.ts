// Alerte « routeur hors ligne » : prévient les administrateurs de l'org par
// e-mail dès qu'un MikroTik perd sa liaison à SafeLinkHub (tunnel tombé, détecté
// par syncRouterStats quand il bascule online → offline).
//
// Anti-doublon robuste : on RÉSERVE l'alerte via un UPDATE conditionnel sur
// routers.offline_alerted_at (posé une seule fois par épisode ; remis à null au
// retour en ligne). Deux syncs concurrents ou un redémarrage du process
// n'envoient donc jamais deux fois la même alerte. Best-effort et détaché : ne
// bloque ni ne fait échouer la synchronisation. Module serveur uniquement.

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routers, users } from "@/lib/db/schema";
import { sendRouterOfflineEmail } from "@/lib/auth/email";

/**
 * À appeler APRÈS avoir marqué un routeur hors ligne. N'alerte QUE si l'état
 * précédent était « online » (chute réelle, pas un routeur en installation qui
 * n'a jamais été joignable) et si aucune alerte n'a encore été envoyée pour cet
 * épisode. Silencieux sur tout échec.
 */
export async function notifyRouterWentOffline(
  routerId: string,
  previousStatus: string,
): Promise<void> {
  if (previousStatus !== "online") return;
  try {
    const db = getDb();
    // Réservation atomique : ne passe QU'UNE fois par épisode (offline_alerted_at
    // encore null). Le premier sync qui gagne la course envoie l'alerte.
    const claimed = await db
      .update(routers)
      .set({ offlineAlertedAt: new Date() })
      .where(and(eq(routers.id, routerId), isNull(routers.offlineAlertedAt)))
      .returning({ id: routers.id, name: routers.name, orgId: routers.orgId });
    if (claimed.length === 0) return; // déjà alerté pour cet épisode

    const router = claimed[0];

    // Nom de l'org (contexte), best-effort.
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, router.orgId))
      .limit(1);

    // Destinataires : les membres VÉRIFIÉS de l'org (ceux qui peuvent agir).
    const admins = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, router.orgId), eq(users.emailVerified, true)));
    if (admins.length === 0) return;

    await Promise.all(
      admins.map((admin) =>
        sendRouterOfflineEmail(admin.email, admin.name || org?.name || "administrateur", router.name).catch(
          () => false,
        ),
      ),
    );
  } catch {
    // best-effort : une alerte ratée ne doit jamais perturber la synchronisation.
  }
}
