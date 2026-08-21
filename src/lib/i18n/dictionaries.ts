import "server-only";
import type { Locale } from "./config";
import type { Dictionary } from "./fr";

/* Chargement paresseux : seul le dictionnaire de la langue demandée entre dans
 * le rendu. Les deux vivent côté serveur — aucun ne part dans le bundle client
 * (les sections publiques sont des composants serveur). */
const dictionaries = {
  fr: () => import("./fr").then((m) => m.fr as Dictionary),
  en: () => import("./en").then((m) => m.en),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}

export type { Dictionary };
