import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import type { RouterOSClient } from "./client";

/**
 * Adopte les forfaits d'un MikroTik configuré À LA MAIN (MikHmon), pour que le
 * portail captif affiche SES tarifs réels.
 *
 * L'auto-setup pousse les forfaits de la base VERS le routeur ; un routeur
 * configuré à la main n'a jamais fait ce trajet, donc aucune ligne `packages`
 * ne lui est rattachée et le portail retombe sur les forfaits « legacy » de
 * l'org — ceux d'un autre site, aux tarifs différents. Constaté en prod : un
 * routeur vendait 01-MOIS à 2 000 F pendant que son portail affichait 3 000 F.
 * On lit donc le tarif là où il fait foi pour ce genre de routeur : le profil
 * hotspot lui-même.
 */

export type ImportedHotspotPlan = {
  name: string;
  priceCents: number;
  durationValue: number;
  durationUnit: string;
};

// MikHmon encode le tarif et la validité DANS le script on-login du profil :
//   :put (",remc,<prix>,<durée>,<prix de vente>,,Enable,")
// C'est la même convention que voucher-profiles.ts écrit à l'aller ; on la relit
// ici au retour plutôt que de deviner d'après le nom du profil (« 01-MOIS » ne
// dit rien du prix, et les noms sont libres).
const MIKHMON_ON_LOGIN_RE = /,remc,(\d+),(\d+)([mhdw]),/;

/** Jours → semaines/mois quand la durée tombe juste, pour retrouver les
 *  libellés usuels (7j → « 01 Semaine », 30j → « 01 Mois ») plutôt que « 30 Jours ». */
function normalizeDuration(value: number, code: string): { durationValue: number; durationUnit: string } {
  if (code === "m") return { durationValue: value, durationUnit: "Minutes" };
  if (code === "h") return { durationValue: value, durationUnit: "Hours" };
  if (code === "w") return { durationValue: value, durationUnit: "Weeks" };
  if (value > 0 && value % 30 === 0) return { durationValue: value / 30, durationUnit: "Months" };
  if (value > 0 && value % 7 === 0) return { durationValue: value / 7, durationUnit: "Weeks" };
  return { durationValue: value, durationUnit: "Days" };
}

export function parseHotspotProfilePlan(name: string, onLogin: string): ImportedHotspotPlan | null {
  const match = MIKHMON_ON_LOGIN_RE.exec(onLogin);
  if (!match) return null;
  const priceCents = Number(match[1]);
  const durationValue = Number(match[2]);
  // Un profil à 0 F n'est pas vendable (promo/interne) — l'afficher inviterait à
  // « payer » zéro. Idem pour une durée nulle : rien à vendre.
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  if (!Number.isFinite(durationValue) || durationValue <= 0) return null;
  return { name, ...normalizeDuration(durationValue, match[3]) , priceCents };
}

/** Lit les profils hotspot du routeur et n'en garde que les forfaits vendables. */
export async function readRouterHotspotPlans(
  client: RouterOSClient,
  timeoutMs = 30000,
): Promise<ImportedHotspotPlan[]> {
  const rows = await client.talk(["/ip/hotspot/user/profile/print"], timeoutMs);
  const plans: ImportedHotspotPlan[] = [];
  for (const row of rows) {
    const name = (row.name ?? "").trim();
    if (!name || name === "default") continue;
    const plan = parseHotspotProfilePlan(name, row["on-login"] ?? "");
    if (plan) plans.push(plan);
  }
  return plans;
}

export type HotspotPlanImportResult = {
  imported: ImportedHotspotPlan[];
  skipped: "already-managed" | "no-priced-profile" | null;
};

/**
 * Rattache les forfaits lus sur le routeur — UNIQUEMENT si rien n'est déjà
 * enregistré pour lui. Un routeur passé par l'auto-setup a des forfaits gérés
 * depuis /admin/packages (la base fait foi, et l'admin peut y avoir changé un
 * prix pas encore poussé) : les écraser avec ce que porte l'appareil annulerait
 * silencieusement sa saisie. On ne comble donc que le trou : le routeur qui n'a
 * aucun forfait à lui.
 */
export async function importRouterHotspotPlans(
  client: RouterOSClient,
  routerId: string,
  orgId: string,
  timeoutMs = 30000,
): Promise<HotspotPlanImportResult> {
  const db = getDb();
  const existing = await db
    .select({ id: packages.id })
    .from(packages)
    .where(and(eq(packages.orgId, orgId), eq(packages.routerId, routerId)))
    .limit(1);
  if (existing.length > 0) return { imported: [], skipped: "already-managed" };

  const plans = await readRouterHotspotPlans(client, timeoutMs);
  if (plans.length === 0) return { imported: [], skipped: "no-priced-profile" };

  // Les lignes « legacy » (routerId=null) restent intactes : d'autres routeurs
  // de l'org retombent encore dessus. On ajoute, on n'adopte pas.
  await db.insert(packages).values(
    plans.map((plan) => ({
      orgId,
      routerId,
      name: plan.name,
      priceCents: plan.priceCents,
      durationValue: plan.durationValue,
      durationUnit: plan.durationUnit,
    })),
  );

  return { imported: plans, skipped: null };
}
