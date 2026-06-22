"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { vouchers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

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
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const packageId = String(formData.get("packageId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!packageId) return { error: "Select a package." };
  if (!quantity || quantity < 1 || quantity > 200) {
    return { error: "Quantity must be between 1 and 200." };
  }

  const db = getDb();
  const rows = Array.from({ length: quantity }, () => ({
    orgId: session.orgId,
    username: randomCode(),
    packageId,
    status: "PROVISIONED" as const,
    useCase: "Batch Create",
    note,
  }));

  await db.insert(vouchers).values(rows);

  revalidatePath("/admin/vouchers");
  return { success: true, created: quantity };
}
