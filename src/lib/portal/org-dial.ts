// Indicatif d'appel « du pays où opère le routeur » pour une org. L'org n'a pas
// de pays propre : on le déduit de son compte fondateur (plus ancien user de
// l'org ayant renseigné son pays à l'inscription — voir users.country /
// users.phoneDialCode). Sert au préfixe du portail captif et à l'OTP.
// Module serveur uniquement.

import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveDialCode } from "./otp";

export type OrgDial = { dialCode: string; iso2: string };

/** { dialCode:"+225", iso2:"CI" } — ou vides si aucun user n'a de pays. */
export async function getOrgDial(orgId: string): Promise<OrgDial> {
  const db = getDb();
  const [u] = await db
    .select({ country: users.country, dial: users.phoneDialCode })
    .from(users)
    .where(and(eq(users.orgId, orgId), isNotNull(users.country)))
    .orderBy(asc(users.createdAt))
    .limit(1);
  const iso2 = (u?.country ?? "").toUpperCase();
  return { dialCode: resolveDialCode(u?.dial ?? null, u?.country ?? null), iso2 };
}
