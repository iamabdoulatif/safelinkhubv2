/**
 * Ventes MikHmon (rapports, revenus du jour / du mois) illisibles.
 *
 * Tout MikHmon — laksa19/mikhmonv3 d'origine comme mikhmon-sf-v1 — enregistre
 * chaque vente depuis le `on-login` du profil :
 *
 *     /system script add name="$date-|-$time-|-$user-|-prix-|-…" owner="$month$year" source=$date comment=mikhmon
 *
 * puis ses rapports filtrent par `owner` = « oct2026 » (mois) et par nom
 * commençant par « oct/13/2026 » (jour). Depuis RouterOS 7.10, `$date` vaut
 * « 2026-10-13 » : le nom devient ISO et `owner` vaut « 202-13 » (découpage
 * aux positions de l'ancien format). Les ventes existent mais aucun rapport
 * ne les compte.
 *
 * RouterOS 7.24 : le `on-login` tourne en contexte `*sys`, qui ÉCRASE le
 * `owner=` passé à `/system script add` (relevé sur 6 routeurs du parc, toutes
 * les ventes à `owner=*sys`) : revenus mensuels à 0. Un `set owner=` depuis un
 * planificateur, lui, tient (vérifié sur HSPT-ADJA 7.24.1) — d'où OWNER_SWEEP.
 *
 * Le `on-login` est corrigé par patchOnLoginForIsoClock (ventes futures) ;
 * ce module remet au format MikHmon les ventes DÉJÀ enregistrées.
 */
import type { RouterOSClient } from "./client";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SEP = "-|-";

/** « 2026-10-13 » → « oct/13/2026 » ; « oct/13/2026 » inchangé ; sinon null. */
export function legacyMikhmonDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const month = MONTHS[Number(iso[2]) - 1];
    return month ? `${month}/${iso[3]}/${iso[1]}` : null;
  }
  return /^[a-z]{3}\/\d{2}\/\d{4}$/.test(value) && MONTHS.includes(value.slice(0, 3)) ? value : null;
}

type SaleRow = { name?: string; owner?: string; source?: string };

/** Valeurs attendues par les rapports MikHmon, ou null si la vente est déjà lisible (ou non reconnue). */
export function legacySaleRecord(row: SaleRow): { name: string; owner: string; source: string } | null {
  const name = row.name ?? "";
  const cut = name.indexOf(SEP);
  if (cut < 0) return null;
  const date = legacyMikhmonDate(name.slice(0, cut));
  if (!date) return null;
  const fixed = { name: date + name.slice(cut), owner: date.slice(0, 3) + date.slice(7), source: date };
  return fixed.name === name && fixed.owner === row.owner && fixed.source === row.source ? null : fixed;
}

/** Planificateur qui rend leur `owner` aux ventes écrasées en `*sys` (RouterOS 7.24+). */
export const OWNER_SWEEP_NAME = "slh-mikhmon-owner";
export const OWNER_SWEEP_SCRIPT =
  ':foreach i in=[/system script find where comment="mikhmon" and owner="*sys"] do={' +
  ':local n [/system script get $i name];' +
  ':if ([:pick $n 3 4] = "/") do={/system script set $i owner=([:pick $n 0 3] . [:pick $n 7 11])}}';

/** RouterOS dont le on-login écrase `owner` (7.24 et suivants). */
export function overwritesSaleOwner(version: string): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version);
  return !!m && (Number(m[1]) > 7 || (Number(m[1]) === 7 && Number(m[2]) >= 24));
}

/** Pose (ou remet à jour) le planificateur. Idempotent. */
export async function ensureOwnerSweep(client: RouterOSClient, timeoutMs = 30000): Promise<"added" | "present"> {
  const rows = await client.talk(["/system/scheduler/print", `?name=${OWNER_SWEEP_NAME}`], timeoutMs);
  if (rows[0]?.["on-event"] === OWNER_SWEEP_SCRIPT) return "present";
  for (const r of rows) if (r[".id"]) await client.talk(["/system/scheduler/remove", `=.id=${r[".id"]}`], timeoutMs);
  await client.talk(["/system/scheduler/add", `=name=${OWNER_SWEEP_NAME}`, "=interval=2m", `=on-event=${OWNER_SWEEP_SCRIPT}`, "=comment=SafeLinkHub : revenus MikHmon (owner des ventes, RouterOS 7.24+)"], timeoutMs);
  return "added";
}

export type SalesRepairResult = { total: number; found: number; rewritten: number; failed: number };

/** Ventes illisibles, sans rien écrire (diagnostic). */
export async function countUnreadableSales(client: RouterOSClient, timeoutMs = 60000): Promise<{ total: number; found: number }> {
  const rows = await client.talk(["/system/script/print", "?comment=mikhmon", "=.proplist=.id,name,owner,source"], timeoutMs) as Record<string, string>[];
  return { total: rows.length, found: rows.filter((r) => legacySaleRecord(r)).length };
}

/** Réécrit nom, owner et source des ventes illisibles. Ne supprime aucune vente. */
export async function rewriteIsoSalesRecords(client: RouterOSClient, timeoutMs = 60000): Promise<SalesRepairResult> {
  const rows = await client.talk(["/system/script/print", "?comment=mikhmon", "=.proplist=.id,name,owner,source"], timeoutMs) as Record<string, string>[];
  let found = 0, rewritten = 0, failed = 0;
  for (const row of rows) {
    const fixed = legacySaleRecord(row);
    if (!fixed || !row[".id"]) continue;
    found++;
    try {
      await client.talk(["/system/script/set", `=.id=${row[".id"]}`, `=name=${fixed.name}`, `=owner=${fixed.owner}`, `=source=${fixed.source}`], timeoutMs);
      rewritten++;
    } catch {
      failed++;
    }
  }
  return { total: rows.length, found, rewritten, failed };
}
