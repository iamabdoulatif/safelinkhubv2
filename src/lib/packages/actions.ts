"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export async function createPackage(_prevState: unknown, formData: FormData) {
  const session = await getSession();
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

  if (!name || durationValue <= 0) {
    return { error: "Package name and duration are required." };
  }
  if (price < 500) {
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
  const session = await getSession();
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
