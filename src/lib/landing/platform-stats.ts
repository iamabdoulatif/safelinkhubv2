// Chiffres de plateforme affichés en page d'accueil.
// Module « plain » : rien ici ne doit devenir un endpoint.
//
// RÈGLE DE CE FICHIER : on ne publie que ce que la base peut confirmer, et on
// ne publie AUCUN montant.
//
// Les quatre cartes du hero annonçaient jusqu'ici 18 742 000 FCFA sur trente
// jours et 486 500 FCFA le jour même. C'étaient des valeurs de maquette parties
// en production. Mesuré le 20/08/2026 : 1 750 FCFA sur trente jours, et zéro
// commande payée dans portal_orders depuis l'origine. Publier des recettes
// inventées est une affirmation fausse ; publier les vraies ne vendrait rien.
// On montre donc ce que le produit SUPERVISE — des volumes réels et
// honorables — jamais ce qu'il aurait encaissé.

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { vendors } from "@/components/landing/content";
import { WALLET_PAYMENT_METHODS } from "@/lib/wallet/payment-options";

export type PlatformStats = {
  /** Routeurs enregistrés sur la plateforme, tous comptes confondus. */
  routers: number;
  /** Sessions en cours, comptées sur les seuls routeurs joignables. */
  sessions: number;
  vendors: number;
  /** Opérateurs mobile money, nommés. La carte bancaire en est exclue : la
   *  landing parle de mobile money, et un compte « 5 » sous une légende qui
   *  n'en nomme que quatre se contredit tout seul. */
  mobileMoney: readonly string[];
};

/** Faits produit, vrais sans interroger la base. Sert aussi de repli.
 *
 *  Le compte ET la légende sortent de la MÊME liste : ajouter un opérateur
 *  dans payment-options.ts met les deux à jour, il n'y a rien à recopier. */
const PRODUCT_FACTS = {
  vendors: vendors.length,
  mobileMoney: WALLET_PAYMENT_METHODS.filter((m) => m.id !== "card").map((m) => m.label),
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const fallback: PlatformStats = { routers: 0, sessions: 0, ...PRODUCT_FACTS };
  if (!process.env.DATABASE_URL) return fallback;

  const [row] = await getDb()
    .select({
      routers: sql<number>`count(*)::int`,
      // Les sessions d'un routeur hors ligne sont celles de sa dernière
      // synchronisation — elles n'existent plus. Même correction que le
      // tableau de bord (voir lib/dashboard/queries.ts).
      sessions: sql<number>`coalesce(sum(${routers.activeUsers}) filter (where ${routers.status} = 'online'), 0)::int`,
    })
    .from(routers)
    .catch(() => []);

  return {
    routers: row?.routers ?? 0,
    sessions: row?.sessions ?? 0,
    ...PRODUCT_FACTS,
  };
}
