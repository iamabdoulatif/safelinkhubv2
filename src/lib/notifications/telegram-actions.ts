"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { configureOrganizationTelegram, readOrganizationTelegram, type TelegramCommand } from "./telegram-configuration";

export type { TelegramCommand } from "./telegram-configuration";
export async function getTelegramSettings() {
  return readOrganizationTelegram(await requireAdminSession());
}
export async function configureTelegram(command: TelegramCommand) {
  const result = await configureOrganizationTelegram(await requireAdminSession(), command);
  if (result.ok) revalidatePath("/admin/settings/notifications");
  return result;
}
