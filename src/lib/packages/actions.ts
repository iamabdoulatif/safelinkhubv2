"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/session";

/** Forfaits actifs de l'organisation — utilisé par l'auto-setup routeur
 * pour pré-remplir les profils voucher sans les ressaisir à la main. */
export async function listActivePackages() {
  const session = await requireAdminSession();
  if (!session) return [];
  const db = getDb();
  return db
    .select({
      id: packages.id,
      name: packages.name,
      priceCents: packages.priceCents,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
    })
    .from(packages)
    .where(and(eq(packages.orgId, session.orgId), eq(packages.active, true)));
}

export async function createPackage(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
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
  await db.insert(packages).values({
    orgId: session.orgId,
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
