"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { organizations, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { isRemoteAccessService } from "@/lib/billing/remote-access-gate-config";
import {
  createRemoteAccessGrant,
  isTemporaryAccessDuration,
  isTemporaryAccessReason,
  revokeRemoteAccessGrant,
} from "./grants";

export async function createTemporaryAccessGrant(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const orgId = String(formData.get("orgId") ?? "");
  const routerIdValue = String(formData.get("routerId") ?? "");
  const durationKey = String(formData.get("durationKey") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const services = formData.getAll("services").map(String).filter(isRemoteAccessService);
  if (!orgId || !isTemporaryAccessDuration(durationKey) || !isTemporaryAccessReason(reason)) {
    return { error: "Organisation, durée ou motif invalide." };
  }
  if (!note) return { error: "Ajoutez une note pour expliquer l’attribution du pass." };

  const db = getDb();
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return { error: "Organisation introuvable." };

  let routerId: string | null = null;
  if (routerIdValue) {
    const [router] = await db
      .select({ id: routers.id, orgId: routers.orgId })
      .from(routers)
      .where(and(eq(routers.id, routerIdValue), eq(routers.orgId, orgId)))
      .limit(1);
    if (!router) return { error: "Le routeur n’appartient pas à cette organisation." };
    routerId = router.id;
  }

  await createRemoteAccessGrant({
    orgId,
    routerId,
    services,
    durationKey,
    reason,
    note,
    createdBy: session!.userId,
  });
  revalidatePath("/admin/remote-access");
  return { success: true as const };
}

export async function revokeTemporaryAccessGrant(id: string, revokeReason: string) {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };
  if (!revokeReason.trim()) return { error: "Le motif de révocation est obligatoire." };
  const row = await revokeRemoteAccessGrant(id, session!.userId, revokeReason);
  if (!row) return { error: "Pass introuvable, expiré ou déjà révoqué." };
  revalidatePath("/admin/remote-access");
  return { success: true as const };
}
