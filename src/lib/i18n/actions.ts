"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale } from "./config";
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from "./server";
import { getSession } from "@/lib/auth/session";

/* Un cookie ne peut pas être posé pendant le rendu d'un composant serveur :
 * les en-têtes sont déjà partis. D'où cette action, appelée depuis un
 * formulaire du sélecteur de langue. */
export async function setLocale(formData: FormData) {
  const session = await getSession();
  if (!session) return;

  const demande = String(formData.get("locale") ?? "");
  if (!isLocale(demande)) return;
  (await cookies()).set(LOCALE_COOKIE, demande, LOCALE_COOKIE_OPTIONS);
  // Tout le tableau de bord change de langue d'un coup.
  revalidatePath("/admin", "layout");
}
