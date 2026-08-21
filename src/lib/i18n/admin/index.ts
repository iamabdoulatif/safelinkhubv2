import "server-only";
import { getLocale } from "../server";
import type { AdminDictionary } from "./fr";

/* Chargement paresseux : une page d'administration n'embarque que la langue
 * demandée, et la landing n'embarque rien de tout ceci. */
const dictionaries = {
  fr: () => import("./fr").then((m) => m.adminFr as AdminDictionary),
  en: () => import("./en").then((m) => m.adminEn),
};

/** Dictionnaire d'administration dans la langue choisie par l'utilisateur. */
export async function getAdminDict(): Promise<AdminDictionary> {
  return dictionaries[await getLocale()]();
}

export type { AdminDictionary };
