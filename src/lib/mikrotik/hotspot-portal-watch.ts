/**
 * VEILLE DU PORTAIL — détecter et réparer sans qu'un humain regarde.
 *
 * Le diagnostic « Pourquoi un ticket ne se connecte pas » sait reconnaître un
 * portail qui ne s'affiche plus (hotspot-portal-health.ts) et le réparer d'un
 * clic (hotspot-portal-repair.ts). Mais un clic suppose que quelqu'un a ouvert
 * l'écran : sur HSPT-FOUANGA la panne a duré des heures avant qu'un exploitant
 * la remonte. Ce module joue le même contrôle à chaque synchronisation d'un
 * routeur — health-check planifié ou chargement de la liste des routeurs — et
 * relance le serveur hotspot lui-même quand le journal porte la signature.
 *
 * Débounce à six heures (routers.portal_repaired_at) : le verdict lit un
 * journal qui couvre plusieurs heures, et un site où personne n'achète de
 * ticket pendant une nuit — portail affiché, aucun formulaire — ressemble à la
 * panne. Une relance de trois secondes par erreur toutes les six heures est un
 * coût qu'on accepte ; une à chaque sync ne l'est pas.
 *
 * Best-effort de bout en bout : rien ici ne doit faire échouer la synchro.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routers, users } from "@/lib/db/schema";
import { sendPortalRepairedEmail } from "@/lib/auth/email";
import type { RouterOSClient } from "./client";
import { assessPortalHealth, type PortalHealth } from "./hotspot-portal-health";
import { repairHotspotPortal } from "./hotspot-portal-repair";

export const PORTAL_REPAIR_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type PortalWatchOutcome =
  | { action: "none"; health: PortalHealth }
  | { action: "cooldown"; health: PortalHealth }
  | { action: "repaired"; health: PortalHealth; activeAfter: number }
  | { action: "failed"; health: PortalHealth; error: string };

/** Décision pure : faut-il relancer, sachant la dernière relance ? */
export function shouldRepair(
  health: PortalHealth,
  lastRepairedAt: Date | null | undefined,
  now = new Date(),
): "repair" | "cooldown" | "none" {
  if (health.verdict !== "suspect") return "none";
  if (lastRepairedAt && now.getTime() - lastRepairedAt.getTime() < PORTAL_REPAIR_COOLDOWN_MS) {
    return "cooldown";
  }
  return "repair";
}

export async function watchHotspotPortal(
  client: RouterOSClient,
  router: { id: string; name: string; orgId: string; portalRepairedAt: Date | null },
  timeoutMs = 20000,
): Promise<PortalWatchOutcome> {
  const log = await client.talk(["/log/print"], timeoutMs).catch(() => [] as Record<string, string>[]);
  const health = assessPortalHealth(
    log
      .filter((row) => /hotspot/i.test(`${row.topics ?? ""} ${row.message ?? ""}`))
      .map((row) => row.message ?? ""),
  );

  const decision = shouldRepair(health, router.portalRepairedAt);
  if (decision === "none") return { action: "none", health };
  if (decision === "cooldown") return { action: "cooldown", health };

  try {
    const repair = await repairHotspotPortal(client, timeoutMs);
    await getDb()
      .update(routers)
      .set({ portalRepairedAt: new Date() })
      .where(eq(routers.id, router.id));
    console.log(
      JSON.stringify({
        msg: "portal watch: hotspot server restarted",
        routerId: router.id,
        router: router.name,
        newDevices: health.newDevices,
        cookieLogins: health.cookieLogins,
        activeBefore: repair.activeBefore,
        activeAfter: repair.activeAfter,
        dnsEntryAdded: repair.dnsEntryAdded,
      }),
    );
    void notifyAdmins(router, health);
    return { action: "repaired", health, activeAfter: repair.activeAfter };
  } catch (err) {
    return { action: "failed", health, error: err instanceof Error ? err.message : String(err) };
  }
}

/* Même destinataires que l'alerte « hors ligne » : les membres vérifiés de
   l'organisation. Une relance silencieuse cacherait un problème récurrent. */
async function notifyAdmins(
  router: { name: string; orgId: string },
  health: PortalHealth,
): Promise<void> {
  try {
    const db = getDb();
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, router.orgId))
      .limit(1);
    const admins = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, router.orgId), eq(users.emailVerified, true)));
    await Promise.all(
      admins.map((a) =>
        sendPortalRepairedEmail(a.email, a.name || org?.name || "administrateur", router.name, {
          newDevices: health.newDevices,
          cookieLogins: health.cookieLogins,
        }).catch(() => false),
      ),
    );
  } catch {
    // best-effort
  }
}
