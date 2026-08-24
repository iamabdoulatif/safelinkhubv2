"use server";

import { revalidatePath } from "next/cache";
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
import { guardTransferApproval, guardTransferRequest } from "./router-transfer";

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

/** Le propriétaire demande le transfert. Le superadmin tranchera. */
export async function requestRouterTransfer(_prevState: unknown, formData: FormData) {
  const session = await requireCapability("routers");
  if (!session) return { error: "Action réservée aux membres qui gèrent le parc." };

  const routerId = String(formData.get("routerId") ?? "");
  const toEmail = String(formData.get("toEmail") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
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

  await db.insert(routerTransferRequests).values({
    routerId,
    fromOrgId: routeur.orgId,
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

  revalidatePath(PAGE_ROUTEURS);
  revalidatePath(PAGE_TRANSFERTS);
  return { success: true as const };
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
