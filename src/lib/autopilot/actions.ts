"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { createLinkCode, revokeLink } from "./link";

export async function generateAutopilotCode(): Promise<{ code?: string; error?: string }> {
  const session = await requireAdminSession();
  if (!session?.orgId) return { error: "Réservé aux administrateurs." };
  return { code: await createLinkCode(session.orgId) };
}

export async function revokeAutopilotLink(): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  if (!session?.orgId) return { error: "Réservé aux administrateurs." };
  await revokeLink(session.orgId);
  revalidatePath("/admin/settings/advanced");
  return {};
}
