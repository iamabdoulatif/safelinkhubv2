// Répartition géographique des comptes SafeLinkHub.
// Module « plain » : rien ici ne doit devenir un endpoint.

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { findCountry, countryFlag } from "@/lib/intl/countries";

export type CountryRow = {
  /** Code ISO2, ou null pour les comptes créés avant l'ajout du champ. */
  iso2: string | null;
  label: string;
  flag: string;
  accounts: number;
  share: number;
};

/**
 * Comptes par pays, du plus nombreux au moins nombreux.
 *
 * Les comptes SANS pays ne sont pas écartés : ils datent d'avant l'ajout du
 * champ à l'inscription, et les masquer ferait mentir les pourcentages. Ils
 * apparaissent en dernier, nommés « Non renseigné » — un exploitant doit voir
 * ce qu'il ne sait pas, pas un total qui a l'air complet.
 */
export async function getAccountsByCountry(): Promise<CountryRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();

  const rows = await db
    .select({ country: users.country, count: sql<number>`count(*)::int` })
    .from(users)
    .groupBy(users.country)
    .catch(() => [] as { country: string | null; count: number }[]);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return [];

  return rows
    .map((r) => {
      const iso2 = r.country?.trim() || null;
      const known = iso2 ? findCountry(iso2) : undefined;
      return {
        iso2,
        label: known?.name ?? (iso2 ? iso2 : "Non renseigné"),
        flag: iso2 ? countryFlag(iso2) : "—",
        accounts: r.count,
        share: r.count / total,
      };
    })
    .sort((a, b) => {
      // « Non renseigné » ferme la marche quel que soit son volume : ce n'est
      // pas un marché, c'est une lacune de données.
      if (a.iso2 === null) return 1;
      if (b.iso2 === null) return -1;
      return b.accounts - a.accounts;
    });
}
