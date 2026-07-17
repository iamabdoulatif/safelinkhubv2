"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerBackups, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { installTemplateOnRouter } from "@/lib/captive-templates/actions";
import {
  captureRouterBackup,
  listOrgBackups,
  restoreBackupToRouter,
  scanRestoreTarget,
} from "./router-backup";

const PAGE = "/admin/router/backups";

/** Sauvegarde immédiate d'un routeur (bouton « Sauvegarder maintenant »). */
export async function backupRouterNow(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  // Garde d'org : sans elle, un routerId deviné suffirait à siphonner les
  // tickets d'un autre opérateur.
  const [router] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const result = await captureRouterBackup(routerId, { trigger: "manual" });
  if ("error" in result && result.error) return { error: result.error };

  revalidatePath(PAGE);
  return result;
}

/**
 * Restaure une sauvegarde sur un routeur cible (le rechange).
 *
 * `dryRun` est proposé dans l'UI avant toute écriture : sur ~5 000 tickets, on
 * veut voir ce qui va être créé avant de le faire.
 */
export async function restoreBackup(
  backupId: string,
  targetRouterId: string,
  dryRun: boolean,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [backup] = await db
    .select({ id: routerBackups.id })
    .from(routerBackups)
    .where(and(eq(routerBackups.id, backupId), eq(routerBackups.orgId, session.orgId)))
    .limit(1);
  if (!backup) return { error: "Sauvegarde introuvable." };

  const [target] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, targetRouterId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!target) return { error: "Routeur cible introuvable." };

  const result = await restoreBackupToRouter(backupId, targetRouterId, { dryRun });

  // Le portail captif est la dernière étape, et elle est indispensable : ses
  // fichiers ne sont pas dans la sauvegarde (ils vivent sur la flash), donc sans
  // ça le rechange servirait la page de connexion RouterOS par défaut — ni
  // forfaits, ni paiement. installTemplateOnRouter repose les fichiers, règle le
  // html-directory, le walled-garden, et adopte au passage les profils tout
  // juste restaurés comme forfaits (import v70) : les prix affichés sont donc
  // ceux du routeur, pas les tarifs legacy de l'org.
  let portal: { installed: boolean; templateName?: string | null; error?: string } | undefined;
  const templateId =
    "plan" in result && result.plan ? result.plan.portal.templateId : null;
  if (!dryRun && "success" in result && result.success && templateId) {
    const install = await installTemplateOnRouter(targetRouterId, templateId);
    portal =
      install && "error" in install && install.error
        ? { installed: false, error: install.error }
        : {
            installed: true,
            templateName: "plan" in result ? result.plan.portal.templateName : null,
          };
  }

  if (!dryRun) revalidatePath(PAGE);
  return { ...result, portal };
}

/**
 * Scan matériel du rechange + plan d'adaptation. Lecture seule — c'est l'étape
 * à faire AVANT de restaurer, pour savoir si ce boîtier peut reprendre l'ancien.
 */
export async function scanTargetForRestore(backupId: string, targetRouterId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [backup] = await db
    .select({ id: routerBackups.id })
    .from(routerBackups)
    .where(and(eq(routerBackups.id, backupId), eq(routerBackups.orgId, session.orgId)))
    .limit(1);
  if (!backup) return { error: "Sauvegarde introuvable." };

  const [target] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, targetRouterId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!target) return { error: "Routeur cible introuvable." };

  return scanRestoreTarget(backupId, targetRouterId);
}

export async function deleteBackup(backupId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  await db
    .delete(routerBackups)
    .where(and(eq(routerBackups.id, backupId), eq(routerBackups.orgId, session.orgId)));

  revalidatePath(PAGE);
  return { success: true as const };
}

export async function getOrgBackups() {
  const session = await getSession();
  if (!session) return [];
  return listOrgBackups(session.orgId);
}
