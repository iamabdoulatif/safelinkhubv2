"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerMikhmonCloudInstances, routerPortForwards, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { runOnRelay } from "./relay";
import {
  ensureCloudMikhmonInstance,
  removeCloudMikhmonInstance,
  stopCloudMikhmonInstance,
} from "./mikhmon-cloud";
import { editionAReposer, verdictRenommage } from "./mikhmon-cloud-lifecycle";

/**
 * Gestion d'une instance MikHmon cloud après son activation.
 *
 * Ces quatre gestes existaient déjà côté relais — mais seulement pour qui a un
 * accès SSH au VPS. Les exposer ici, c'est rendre à l'exploitant ce qu'il ne
 * pouvait obtenir qu'en nous le demandant.
 */

/** Le routeur, et le droit d'y toucher. Même règle que enablePortForward. */
async function routeurAutorise(routerId: string) {
  const session = await getSession();
  if (!session) return { erreur: "Not authenticated." as const };
  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, orgId: routers.orgId, name: routers.name })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { erreur: "Router not found." as const };
  }
  return { router };
}

async function instanceDe(routerId: string) {
  const [row] = await getDb()
    .select()
    .from(routerMikhmonCloudInstances)
    .where(eq(routerMikhmonCloudInstances.routerId, routerId))
    .limit(1);
  return row ?? null;
}

function rafraichir() {
  revalidatePath("/admin/mikhmon-online");
  revalidatePath("/admin/remote-access");
}

/** Arrête le tableau sans rien détruire — l'adresse est conservée. */
export async function desactiverMikhmonCloud(routerId: string) {
  const acces = await routeurAutorise(routerId);
  if ("erreur" in acces) return { error: acces.erreur };
  try {
    const fait = await stopCloudMikhmonInstance(routerId);
    if (!fait) return { error: "Aucune instance à désactiver." };
    rafraichir();
    return { success: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "L’arrêt a échoué." };
  }
}

/** Remet le tableau en marche. Rien n'est retéléchargé. */
export async function activerMikhmonCloud(routerId: string) {
  const acces = await routeurAutorise(routerId);
  if ("erreur" in acces) return { error: acces.erreur };
  const instance = await instanceDe(routerId);
  if (!instance) return { error: "Aucune instance à activer." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router) return { error: "Router not found." };
  try {
    /* On repasse par ensureCloudMikhmonInstance plutôt que d'appeler
       `docker start` ici : elle sait déjà redémarrer un conteneur existant ET
       réécrire la session MikHmon, qui peut avoir été perdue si le conteneur
       a été recréé entre-temps. */
    await ensureCloudMikhmonInstance(router, editionAReposer(instance));
    await db
      .update(routerMikhmonCloudInstances)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(routerMikhmonCloudInstances.id, instance.id));
    rafraichir();
    return { success: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "La remise en marche a échoué." };
  }
}

/**
 * Change l'adresse du tableau.
 *
 * Le conteneur est RECRÉÉ : la règle Host() de Traefik vit dans ses étiquettes
 * Docker, que Docker ne sait pas modifier. Sans recréation, l'ancienne adresse
 * continuerait de servir et la nouvelle renverrait 404.
 */
export async function renommerMikhmonCloud(routerId: string, slugBrut: string) {
  const acces = await routeurAutorise(routerId);
  if ("erreur" in acces) return { error: acces.erreur };

  const baseDomain = process.env.MIKHMON_CLOUD_BASE_DOMAIN;
  if (!baseDomain) return { error: "MIKHMON_CLOUD_BASE_DOMAIN n’est pas configuré." };

  const instance = await instanceDe(routerId);
  if (!instance) return { error: "Aucune instance à renommer." };

  const verdict = verdictRenommage(instance, slugBrut, baseDomain);
  if (!verdict.ok) return { error: verdict.erreur };
  if (!verdict.recreer) return { success: true as const, domain: instance.domain };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router) return { error: "Router not found." };

  const edition = editionAReposer(instance);
  try {
    await removeCloudMikhmonInstance(routerId);
    /* Le port est libéré avec la ligne : la nouvelle provision en réattribuera
       un, éventuellement le même. Rien à conserver à la main. */
    const recree = await ensureCloudMikhmonInstance(router, edition, verdict.slug);
    rafraichir();
    return { success: true as const, domain: recree.domain };
  } catch (err) {
    /* La suppression a pu réussir avant l'échec de la recréation : on le dit,
       plutôt que de laisser croire que l'ancienne adresse fonctionne encore. */
    return {
      error:
        (err instanceof Error ? err.message : "Le renommage a échoué.") +
        " L’ancienne adresse ne répond plus — relancez l’activation.",
    };
  }
}

/**
 * Supprime l'instance : conteneur, ligne d'instance ET redirection.
 *
 * LES TROIS, pas seulement les deux premières. `enablePortForwardForRouter`
 * court-circuite quand une redirection active existe : une redirection laissée
 * derrière ferait répondre « succès » à la réactivation suivante sans rien
 * créer, et l'exploitant verrait un domaine vide sans un mot d'explication.
 */
export async function supprimerMikhmonCloud(routerId: string) {
  const acces = await routeurAutorise(routerId);
  if ("erreur" in acces) return { error: acces.erreur };
  const db = getDb();
  try {
    await removeCloudMikhmonInstance(routerId);
    /* UNIQUEMENT la redirection MikHmon. Le routeur peut en porter d'autres —
       WinBox, SSH — qui n'ont rien à voir avec ce tableau et dont la
       suppression couperait l'accès distant de l'exploitant. */
    await db
      .delete(routerPortForwards)
      .where(
        and(eq(routerPortForwards.routerId, routerId), eq(routerPortForwards.service, "mikhmon")),
      );
    rafraichir();
    return { success: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "La suppression a échoué." };
  }
}

/** État réel du conteneur sur le relais — la base peut mentir après un reboot. */
export async function etatReelMikhmonCloud(routerId: string) {
  const acces = await routeurAutorise(routerId);
  if ("erreur" in acces) return { error: acces.erreur };
  const instance = await instanceDe(routerId);
  if (!instance) return { error: "Aucune instance." };
  try {
    const sortie = await runOnRelay(
      `sudo docker inspect -f '{{.State.Status}}' ${instance.containerName.replace(/'/g, "")}`,
      20_000,
    );
    return { success: true as const, etat: sortie.trim() };
  } catch {
    return { success: true as const, etat: "absent" };
  }
}
