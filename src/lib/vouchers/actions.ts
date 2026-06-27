"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, vouchers } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/session";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function generateVouchers(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await requireAdminSession();
  if (!session) return { error: "Not authenticated." };

  const packageId = String(formData.get("packageId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!packageId) return { error: "Select a package." };
  if (!quantity || quantity < 1 || quantity > 200) {
    return { error: "Quantity must be between 1 and 200." };
  }

  const db = getDb();
  const [pkg] = await db
    .select({ id: packages.id, active: packages.active })
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, session.orgId)))
    .limit(1);

  if (!pkg) return { error: "Forfait introuvable." };
  if (!pkg.active) return { error: "Ce forfait est désactivé." };

  const rows = Array.from({ length: quantity }, () => ({
    orgId: session.orgId,
    username: randomCode(),
    packageId: pkg.id,
    status: "PROVISIONED" as const,
    useCase: "Batch Create",
    note,
  }));

  await db.insert(vouchers).values(rows);

  revalidatePath("/admin/vouchers");
  return { success: true, created: quantity };
}
