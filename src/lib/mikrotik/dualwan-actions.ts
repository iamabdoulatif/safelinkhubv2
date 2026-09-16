"use server";

import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerDualwanJobs, routerPortForwards, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/net/app-url";
import { decryptSecret } from "./crypto";
import { getRelayPublicHost } from "./relay";
import { connectToRouter } from "./router-sync";
import { removeDualWanConfig } from "./dualwan-remove";
import type { DualWanForm } from "./dualwan-defaults";

/**
 * PROVISIONNEMENT DUAL WAN STARLINK — délégué à n8n (docs/n8n/dualwan.md).
 *
 * Contrairement à la régulation, n8n fait le travail LUI-MÊME en SSH par le
 * relais : la plateforme lui envoie l'hôte/port public SSH du routeur et le
 * compte RouterOS, puis attend la notification sur
 * /api/internal/n8n/dualwan/<jobId>. D'où deux prérequis : le jeton partagé
 * N8N_INTERNAL_TOKEN et un accès SSH distant actif sur le routeur.
 */

const WEBHOOK_URL =
  process.env.N8N_DUALWAN_WEBHOOK_URL ?? "https://latif225.app.n8n.cloud/webhook/slh-dualwan-starlink";
// Au-delà, un « running » sans callback = n8n a perdu l'exécution (timeout 300 s côté workflow).
const STALE_MS = 10 * 60 * 1000;
const IDENT = /^[A-Za-z0-9_.-]+$/;

async function autorise(routerId: string) {
  const session = await getSession();
  if (!session) return null;
  const [router] = await getDb().select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return null;
  return router;
}

function isStale(job: typeof routerDualwanJobs.$inferSelect) {
  return job.status === "running" && Date.now() - job.createdAt.getTime() > STALE_MS;
}

export async function readDualWanJobs(routerId: string) {
  if (!(await autorise(routerId))) return { error: "Routeur introuvable." };
  const jobs = await getDb()
    .select()
    .from(routerDualwanJobs)
    .where(eq(routerDualwanJobs.routerId, routerId))
    .orderBy(desc(routerDualwanJobs.createdAt))
    .limit(10);
  return {
    jobs: jobs.map((j) => ({
      id: j.id,
      status: isStale(j) ? ("stale" as const) : (j.status as "running" | "ok" | "dry_run" | "error" | "removed"),
      request: j.request as Record<string, unknown>,
      result: (j.result ?? null) as null | {
        details?: Record<string, unknown> & { message?: string; step?: string; failed?: string[] };
        backup_file?: string | null;
      },
      at: j.createdAt.toISOString(),
      finishedAt: j.finishedAt?.toISOString() ?? null,
    })),
  };
}

export async function startDualWan(routerId: string, f: DualWanForm) {
  const router = await autorise(routerId);
  if (!router) return { error: "Routeur introuvable." };
  if (!process.env.N8N_INTERNAL_TOKEN) return { error: "N8N_INTERNAL_TOKEN n'est pas configuré sur la plateforme." };
  if (!["complet", "complement"].includes(f.mode) || !["cas1", "cas2", "cas3"].includes(f.cas)) {
    return { error: "Mode ou cas invalide." };
  }
  if (f.mode === "complement" && !f.lanInterface.trim()) {
    return { error: "En mode complément, indiquez l'interface LAN (ex. bridge-LAN, HOTSPOT)." };
  }
  for (const v of [f.lanInterface, f.wan1Interface, f.wan2Interface]) {
    if (v.trim() && !IDENT.test(v.trim())) return { error: `Nom d'interface invalide : « ${v} ».` };
  }
  if (!router.username || !router.passwordEncrypted) return { error: "Identifiants RouterOS absents sur ce routeur." };

  const db = getDb();
  const [ssh] = await db
    .select()
    .from(routerPortForwards)
    .where(
      and(
        eq(routerPortForwards.routerId, routerId),
        eq(routerPortForwards.service, "ssh"),
        eq(routerPortForwards.status, "active"),
      ),
    )
    .limit(1);
  if (!ssh) {
    return { error: "n8n joint le routeur en SSH par le relais : activez d'abord l'accès distant SSH (Accès distant → SSH)." };
  }
  const [last] = await db
    .select()
    .from(routerDualwanJobs)
    .where(and(eq(routerDualwanJobs.routerId, routerId), eq(routerDualwanJobs.status, "running")))
    .orderBy(desc(routerDualwanJobs.createdAt))
    .limit(1);
  if (last && !isStale(last)) return { error: "Un provisionnement est déjà en cours sur ce routeur." };

  const request = {
    site_name: router.name,
    mode: f.mode,
    cas: f.cas,
    lan_interface: f.lanInterface.trim() || undefined,
    wan1_interface: f.wan1Interface.trim() || undefined,
    wan2_interface: f.wan2Interface.trim() || undefined,
    wan1_mbps: Number(f.wan1Mbps) > 0 ? Number(f.wan1Mbps) : undefined,
    wan2_mbps: Number(f.wan2Mbps) > 0 ? Number(f.wan2Mbps) : undefined,
    detach_wan2_from_bridge: f.detachWan2FromBridge,
    dry_run: f.dryRun,
  };
  const [job] = await db.insert(routerDualwanJobs).values({ routerId, request }).returning();

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.N8N_INTERNAL_TOKEN}` },
    body: JSON.stringify({
      ...request,
      router_id: routerId,
      router_host: getRelayPublicHost(router.relayShard),
      router_port: ssh.publicPort,
      router_user: router.username,
      router_pass: decryptSecret(router.passwordEncrypted),
      callback_url: `${getAppUrl()}/api/internal/n8n/dualwan/${job.id}`,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e: Error) => ({ ok: false, status: 0, statusText: e.message }));
  if (!res.ok) {
    const message = `n8n n'a pas accepté la demande (${res.status || "réseau"} ${res.statusText}). Le workflow est-il activé ?`;
    await db
      .update(routerDualwanJobs)
      .set({ status: "error", result: { status: "error", details: { step: "Webhook", message } }, finishedAt: new Date() })
      .where(eq(routerDualwanJobs.id, job.id));
    return { error: message };
  }
  return { ok: true as const, jobId: job.id };
}

/** Retire une ligne d'historique (jamais un job en cours : son callback arriverait dans le vide). */
export async function deleteDualWanJob(routerId: string, jobId: string) {
  if (!(await autorise(routerId))) return { error: "Routeur introuvable." };
  await getDb()
    .delete(routerDualwanJobs)
    .where(and(eq(routerDualwanJobs.id, jobId), eq(routerDualwanJobs.routerId, routerId), ne(routerDualwanJobs.status, "running")));
  return { ok: true as const };
}

/** Vide l'historique terminé du routeur. */
export async function clearDualWanJobs(routerId: string) {
  if (!(await autorise(routerId))) return { error: "Routeur introuvable." };
  await getDb()
    .delete(routerDualwanJobs)
    .where(and(eq(routerDualwanJobs.routerId, routerId), ne(routerDualwanJobs.status, "running")));
  return { ok: true as const };
}

/**
 * Retire la configuration dual WAN par l'API RouterOS à travers le tunnel (pas
 * de passage par n8n : rien à générer, juste défaire par clé). Journalisé
 * comme un job « removed » pour que l'historique raconte aussi le retour arrière.
 */
export async function removeDualWan(routerId: string, f: { wan2Interface: string; returnWan2ToBridge: string }) {
  const router = await autorise(routerId);
  if (!router) return { error: "Routeur introuvable." };
  const wan2 = f.wan2Interface.trim() || "E2-WAN-FAI";
  const bridge = f.returnWan2ToBridge.trim();
  for (const v of [wan2, bridge]) if (v && !IDENT.test(v)) return { error: `Nom d'interface invalide : « ${v} ».` };
  let client;
  try {
    client = await connectToRouter(router, 20000);
  } catch (e) {
    return { error: `Routeur injoignable : ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    const report = await removeDualWanConfig(client, { wan2Interface: wan2, returnWan2ToBridge: bridge || undefined });
    await getDb().insert(routerDualwanJobs).values({
      routerId,
      request: { mode: "retrait", wan2_interface: wan2, return_to_bridge: bridge || null },
      status: "removed",
      result: { status: "removed", details: report },
      finishedAt: new Date(),
    });
    return { ok: true as const, report };
  } catch (e) {
    return { error: `Retrait interrompu : ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    client.close();
  }
}
