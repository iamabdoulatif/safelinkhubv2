"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, routers } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/session";

/** Forfaits actifs de l'organisation — utilisé par l'auto-setup routeur
 * pour pré-remplir les profils voucher sans les ressaisir à la main.
 *
 * Scopé au routeur (mêmes règles strictes que le portail captif) : si un
 * routerId est fourni et que ce routeur a ≥1 forfait rattaché, on ne renvoie
 * que ceux-là ; sinon on retombe sur les forfaits legacy globaux (routerId
 * null). Sans routerId (appelant historique) : tous les forfaits de l'org. */
export async function listActivePackages(routerId?: string) {
  const session = await requireAdminSession();
  if (!session) return [];
  const db = getDb();
  const columns = {
    id: packages.id,
    name: packages.name,
    priceCents: packages.priceCents,
    durationValue: packages.durationValue,
    durationUnit: packages.durationUnit,
  } as const;
  if (!routerId) {
    return db
      .select(columns)
      .from(packages)
      .where(and(eq(packages.orgId, session.orgId), eq(packages.active, true)));
  }
  const scoped = await db
    .select(columns)
    .from(packages)
    .where(
      and(
        eq(packages.orgId, session.orgId),
        eq(packages.active, true),
        eq(packages.routerId, routerId),
      ),
    );
  if (scoped.length > 0) return scoped;
  return db
    .select(columns)
    .from(packages)
    .where(
      and(
        eq(packages.orgId, session.orgId),
        eq(packages.active, true),
        isNull(packages.routerId),
      ),
    );
}

/** Routeurs de l'org (id + nom) — alimente le sélecteur de zone du modal de
 * création de forfait pour rattacher un forfait à un MikroTik précis. */
export async function listOrgRouters() {
  const session = await requireAdminSession();
  if (!session) return [];
  const db = getDb();
  return db
    .select({ id: routers.id, name: routers.name })
    .from(routers)
    .where(eq(routers.orgId, session.orgId))
    .orderBy(asc(routers.name));
}

export async function createPackage(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  // Zone WiFi : forfait rattaché à un MikroTik précis, ou "" = global (routerId
  // null, visible sur tous les routeurs sans forfait propre).
  const routerIdRaw = String(formData.get("routerId") ?? "").trim();
  const durationValue = Number(formData.get("durationValue") ?? 0);
  const durationUnit = String(formData.get("durationUnit") ?? "Hours");
  const uploadMbps = Number(formData.get("uploadMbps") ?? 5);
  const downloadMbps = Number(formData.get("downloadMbps") ?? 5);
  const price = Number(formData.get("price") ?? 0);
  const billingStartsOn = String(
    formData.get("billingStartsOn") ?? "Upon First Use",
  );

  if (!name || !Number.isFinite(durationValue) || durationValue <= 0) {
    return { error: "Package name and duration are required." };
  }
  if (
    !Number.isFinite(uploadMbps) ||
    uploadMbps <= 0 ||
    !Number.isFinite(downloadMbps) ||
    downloadMbps <= 0
  ) {
    return { error: "Bandwidth values must be positive numbers." };
  }
  if (!Number.isFinite(price) || price < 500) {
    return { error: "Minimum price: FCFA 500" };
  }

  const db = getDb();

  // Rattachement à un routeur : n'accepte qu'un MikroTik de l'org (sinon global).
  let routerId: string | null = null;
  if (routerIdRaw) {
    const [router] = await db
      .select({ id: routers.id })
      .from(routers)
      .where(and(eq(routers.id, routerIdRaw), eq(routers.orgId, session.orgId)))
      .limit(1);
    if (!router) return { error: "Routeur invalide." };
    routerId = router.id;
  }

  await db.insert(packages).values({
    orgId: session.orgId,
    routerId,
    name,
    priceCents: price,
    durationValue,
    durationUnit,
    uploadMbps,
    downloadMbps,
    billingStartsOn,
  });

  revalidatePath("/admin/packages");
  return { success: true };
}

export async function togglePackageStatus(packageId: string) {
  const session = await requireAdminSession();
  if (!session) return;

  const db = getDb();
  const [pkg] = await db
    .select({ active: packages.active, orgId: packages.orgId })
    .from(packages)
    .where(eq(packages.id, packageId))
    .limit(1);

  if (!pkg || pkg.orgId !== session.orgId) return;

  await db
    .update(packages)
    .set({ active: !pkg.active })
    .where(eq(packages.id, packageId));

  revalidatePath("/admin/packages");
}
