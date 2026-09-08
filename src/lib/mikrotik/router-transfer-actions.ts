"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  packages,
  roamingGroupRouters,
  routerSerialLocks,
  routerTransferRequests,
  routers,
  users,
} from "@/lib/db/schema";
import { getSession, isSuperAdmin, requireCapability } from "@/lib/auth/session";
import {
  guardDeclaredSerial,
  guardTransferApproval,
  guardTransferRequest,
  normalizeSerial,
  noteSansAvertissement,
} from "./router-transfer";
import { rotateRouterApiPassword, type RotationVerdict } from "./api-password-rotation";

const PAGE_ROUTEURS = "/admin/router";
const PAGE_TRANSFERTS = "/admin/router-transfers";

/** Organisation dont l'e-mail est celui d'un de ses comptes. */
async function resoudreOrgParEmail(email: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .orderBy(asc(users.createdAt))
    .limit(1);
  return row?.orgId ?? null;
}

/**
 * Accroche le compte rendu du renouvellement à la note du superadmin, là où
 * elle est DÉJÀ affichée sous la demande — plutôt que d'inventer une colonne et
 * un bloc d'écran pour une ligne qui ne paraît qu'en cas d'ennui.
 *
 * Il REMPLACE celui du passage précédent : rejouer ne doit pas empiler.
 */
async function noterRotation(id: string, rotation: RotationVerdict) {
  const db = getDb();
  const [demande] = await db
    .select({ adminNote: routerTransferRequests.adminNote })
    .from(routerTransferRequests)
    .where(eq(routerTransferRequests.id, id))
    .limit(1);
  const base = noteSansAvertissement(demande?.adminNote ?? null);
  const note = rotation.ok ? base || null : [base, `\u26a0 ${rotation.error}`].filter(Boolean).join(" — ");
  await db
    .update(routerTransferRequests)
    .set({ adminNote: note })
    .where(eq(routerTransferRequests.id, id));
  revalidatePath(PAGE_TRANSFERTS);
}

/** Le propriétaire demande le transfert. Le superadmin tranchera. */
export async function requestRouterTransfer(_prevState: unknown, formData: FormData) {
  const session = await requireCapability("routers");
  if (!session) return { error: "Action réservée aux membres qui gèrent le parc." };

  const routerId = String(formData.get("routerId") ?? "");
  const toEmail = String(formData.get("toEmail") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const serialDeclare = String(formData.get("serialNumber") ?? "").trim().slice(0, 64);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(toEmail)) {
    return { error: "Adresse e-mail du compte d'arrivée invalide." };
  }

  const db = getDb();
  const [routeur] = await db
    .select({ id: routers.id, orgId: routers.orgId, name: routers.name })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!routeur) return { error: "Routeur introuvable." };

  const enAttente = await db
    .select({ id: routerTransferRequests.id })
    .from(routerTransferRequests)
    .where(
      and(
        eq(routerTransferRequests.routerId, routerId),
        eq(routerTransferRequests.status, "pending"),
      ),
    )
    .limit(1);

  const verdict = guardTransferRequest({
    routerOrgId: routeur.orgId,
    requesterOrgId: session.orgId,
    targetOrgId: null,
    dejaEnAttente: enAttente.length > 0,
  });
  if (!verdict.ok) return { error: verdict.error };

  /* Le numéro connu vient du verrou posé au premier passage en ligne. La
     comparaison se fait APRÈS la vérification de propriété : autrement, un
     compte étranger apprendrait par tâtonnement le SN d'un routeur qui ne lui
     appartient pas. */
  const [verrou] = await db
    .select({ serialNumber: routerSerialLocks.serialNumber })
    .from(routerSerialLocks)
    .where(eq(routerSerialLocks.routerId, routerId))
    .limit(1);
  const serialVerdict = guardDeclaredSerial({
    declared: serialDeclare,
    known: verrou?.serialNumber ?? null,
  });
  if (!serialVerdict.ok) return { error: serialVerdict.error };

  await db.insert(routerTransferRequests).values({
    routerId,
    fromOrgId: routeur.orgId,
    serialNumber: normalizeSerial(serialDeclare),
    toEmail,
    reason: reason || null,
    requestedBy: session.userId,
  });

  revalidatePath(PAGE_ROUTEURS);
  revalidatePath(PAGE_TRANSFERTS);
  return { success: true as const };
}

/** Le demandeur retire sa demande tant qu'elle n'est pas tranchée. */
export async function cancelRouterTransfer(formData: FormData) {
  const session = await requireCapability("routers");
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  await getDb()
    .update(routerTransferRequests)
    .set({ status: "cancelled", decidedAt: new Date() })
    .where(
      and(
        eq(routerTransferRequests.id, id),
        eq(routerTransferRequests.fromOrgId, session.orgId),
        eq(routerTransferRequests.status, "pending"),
      ),
    );
  revalidatePath(PAGE_ROUTEURS);
  revalidatePath(PAGE_TRANSFERTS);
}

/**
 * Décision du superadmin.
 *
 * Le déplacement est fait dans UNE transaction : un routeur dont la ligne
 * `routers` aurait changé d'organisation sans son verrou de série serait
 * refusé à sa prochaine synchronisation — donc laissé hors ligne, chez
 * personne.
 */
export async function decideRouterTransfer(formData: FormData) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return { error: "Réservé au superadmin." };

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const adminNote = String(formData.get("adminNote") ?? "").trim().slice(0, 500) || null;
  if (!["approved", "rejected"].includes(decision)) return { error: "Décision invalide." };

  const db = getDb();
  const [demande] = await db
    .select()
    .from(routerTransferRequests)
    .where(eq(routerTransferRequests.id, id))
    .limit(1);
  if (!demande) return { error: "Demande introuvable." };

  if (decision === "rejected") {
    await db
      .update(routerTransferRequests)
      .set({ status: "rejected", adminNote, decidedAt: new Date(), decidedBy: session.userId })
      .where(eq(routerTransferRequests.id, id));
    revalidatePath(PAGE_TRANSFERTS);
    return { success: true as const };
  }

  const [routeur] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, demande.routerId))
    .limit(1);
  const targetOrgId = await resoudreOrgParEmail(demande.toEmail);

  const verdict = guardTransferApproval({
    routerOrgId: routeur?.orgId ?? "",
    fromOrgId: demande.fromOrgId,
    targetOrgId,
    status: demande.status,
  });
  if (!verdict.ok) return { error: verdict.error };

  await db.transaction(async (tx) => {
    // 1. Le routeur lui-même.
    await tx.update(routers).set({ orgId: targetOrgId! }).where(eq(routers.id, demande.routerId));

    // 2. Son verrou de numéro de série : sans lui, la prochaine synchronisation
    //    verrait un SN rattaché à l'ancien compte et garderait le routeur
    //    hors ligne (voir enforceRouterSerialOnSync).
    await tx
      .update(routerSerialLocks)
      .set({ orgId: targetOrgId! })
      .where(eq(routerSerialLocks.routerId, demande.routerId));

    // 3. Les forfaits PROPRES à ce routeur. Ceux de l'organisation (router_id
    //    nul) ne bougent pas : ils servent aussi aux autres routeurs.
    await tx
      .update(packages)
      .set({ orgId: targetOrgId! })
      .where(eq(packages.routerId, demande.routerId));

    /* MikHmon cloud n'a RIEN à déplacer : sa table n'est indexée que par
       router_id, elle suit donc le routeur d'elle-même. Vérifié plutôt que
       supposé — c'est le typage qui l'a signalé. */

    // 4. Roaming : le routeur SORT des groupes de l'ancien compte au lieu de
    //    les emporter. Un groupe couvre plusieurs zones d'une même
    //    organisation — le déplacer priverait les autres routeurs du leur.
    await tx
      .delete(roamingGroupRouters)
      .where(eq(roamingGroupRouters.routerId, demande.routerId));

    await tx
      .update(routerTransferRequests)
      .set({
        status: "approved",
        toOrgId: targetOrgId!,
        adminNote,
        decidedAt: new Date(),
        decidedBy: session.userId,
      })
      .where(eq(routerTransferRequests.id, id));
  });

  /* Le tunnel n'est PAS refait : ses colonnes vivent sur la ligne `routers`,
     que la transaction vient de déplacer — le compte d'arrivée pilote déjà le
     routeur. Le seul secret à renouveler est le compte API, que l'ancien
     propriétaire a pu lire depuis sa console RouterOS.

     APRÈS la réponse : ouvrir le tunnel prend quelques secondes et peut échouer
     sur un routeur hors ligne. Un transfert déjà tranché ne doit ni attendre
     cela, ni être annulé par cela — l'échec se raconte dans la note, qui est
     déjà affichée sous la demande. */
  after(async () => {
    const rotation = await rotateRouterApiPassword(demande.routerId).catch((err) => ({
      ok: false as const,
      error: `mot de passe API non renouvelé (${err instanceof Error ? err.message : "erreur"})`,
    }));
    await noterRotation(id, rotation);
  });

  revalidatePath(PAGE_ROUTEURS);
  revalidatePath(PAGE_TRANSFERTS);
  return { success: true as const };
}

/**
 * Rejouer le renouvellement du mot de passe API sur un transfert déjà accepté.
 *
 * Deux cas le réclament, et aucun n'est rare : le routeur était HORS LIGNE au
 * moment de la décision — la rotation se fait par son tunnel, elle échoue donc
 * sans rien casser —, et les transferts ANTÉRIEURS à cette étape, qui n'en ont
 * jamais eu. Sans ce bouton, un mot de passe que l'ancien propriétaire a pu
 * lire resterait en place sans qu'aucun écran ne permette de le changer.
 *
 * Synchrone, contrairement à la décision : ici le superadmin ATTEND le verdict,
 * c'est tout l'objet du geste. Ce qui oblige la rotation à tenir dans un budget
 * borné — voir BUDGET_ROTATION_MS : avec les reprises par défaut, un routeur
 * hors ligne dépassait la coupure de Cloudflare et le bouton semblait ne rien
 * faire.
 */
export async function retryRouterApiPasswordRotation(formData: FormData) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return { error: "Réservé au superadmin." };

  const id = String(formData.get("id") ?? "");
  const [demande] = await getDb()
    .select({ routerId: routerTransferRequests.routerId, status: routerTransferRequests.status })
    .from(routerTransferRequests)
    .where(eq(routerTransferRequests.id, id))
    .limit(1);
  if (!demande || demande.status !== "approved") {
    return { error: "Le renouvellement ne concerne qu'un transfert accepté." };
  }

  const rotation = await rotateRouterApiPassword(demande.routerId);
  await noterRotation(id, rotation);
  return rotation.ok ? { success: true as const } : { error: rotation.error };
}

/** File des demandes — superadmin. */
export async function listTransferRequests() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return [];
  return getDb()
    .select({
      id: routerTransferRequests.id,
      routerName: routers.name,
      routerModel: routers.model,
      serialNumber: routerTransferRequests.serialNumber,
      fromOrg: organizations.name,
      toEmail: routerTransferRequests.toEmail,
      reason: routerTransferRequests.reason,
      status: routerTransferRequests.status,
      adminNote: routerTransferRequests.adminNote,
      createdAt: routerTransferRequests.createdAt,
      decidedAt: routerTransferRequests.decidedAt,
    })
    .from(routerTransferRequests)
    .innerJoin(routers, eq(routers.id, routerTransferRequests.routerId))
    .innerJoin(organizations, eq(organizations.id, routerTransferRequests.fromOrgId))
    .orderBy(asc(routerTransferRequests.status), routerTransferRequests.createdAt);
}

/** Demandes ouvertes du compte courant — affichées près de son parc. */
export async function listMyPendingTransfers() {
  const session = await getSession();
  if (!session) return [];
  return getDb()
    .select({
      id: routerTransferRequests.id,
      routerId: routerTransferRequests.routerId,
      routerName: routers.name,
      toEmail: routerTransferRequests.toEmail,
      createdAt: routerTransferRequests.createdAt,
    })
    .from(routerTransferRequests)
    .innerJoin(routers, eq(routers.id, routerTransferRequests.routerId))
    .where(
      and(
        eq(routerTransferRequests.fromOrgId, session.orgId),
        eq(routerTransferRequests.status, "pending"),
        isNull(routerTransferRequests.decidedAt),
      ),
    );
}
