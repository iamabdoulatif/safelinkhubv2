// ALLÉGER la RAM / le CPU des routeurs du parc (demande opérateur, 27/10/2026).
//
// Déclencheur : HSPT-PBT (hAP ax lite, 256 Mio) — la génération de tickets
// faisait tomber le conteneur MikHmon en 502 (« le service ne répond pas »),
// RAM libre ~29 Mio, CPU ~75 %. La cause dominante n'était ni les tickets ni le
// suivi de connexions : MikHmon journalise CHAQUE vente de ticket dans un
// `/system script` (son journal de revenu), et RIEN ne les purge — 12 745
// scripts accumulés depuis août 2025, soit un arbre de configuration énorme à
// parcourir à chaque opération. Le CLEAN_JOB de MikHmon ne retire que les
// planificateurs vides et les jobs finis, jamais ces scripts.
//
// Ce module, appelé à chaque synchronisation (hardening-sync.ts), applique deux
// choses idempotentes et sûres (ne touchent ni au portail, ni au paiement, ni
// aux tickets) :
//   1. ensureResourceTuning : réglages système légers qui réduisent RAM/CPU et
//      surtout l'usure flash (journaux hotspot sortis du disque).
//   2. ensureMikhmonJournalCap : un script + un planificateur quotidien qui
//      plafonne le journal de ventes MikHmon à ~90 jours (3 mois pleins + le
//      mois courant) et le draine par lots pour ne jamais saturer le CPU.
//
// La fenêtre de rétention est volontairement au mois près : calculer « il y a
// 90 jours » exactement en RouterOS Script demande une arithmétique de dates
// fragile (cf. expiry-sweep-script.ts). keepMonths=3 garantit TOUJOURS ≥ 90
// jours conservés — on préfère garder un peu trop que supprimer un revenu que
// l'exploitant voulait voir.

import type { RouterOSClient } from "./client";

export const TUNING_COMMENT = "safelinkhub-tuning";
/** Nom du script et du planificateur qui plafonnent le journal MikHmon. */
export const JOURNAL_CAP_NAME = "slh-journal-cap";
/** Mois pleins conservés en plus du mois courant (≥ 90 jours garantis). */
export const JOURNAL_KEEP_MONTHS = 3;
/** Suppressions max par exécution : borne le pic CPU sur un gros arriéré. */
export const JOURNAL_CAP_PER_RUN = 5000;

type Row = Record<string, string>;

/**
 * Point 1. Réglages système légers. Tout en `set` → idempotent.
 * - Journaux hotspot : du DISQUE vers la MÉMOIRE. Sur HSPT-PBT, 144 000 secteurs
 *   écrits en 21 h venaient de là — usure flash + CPU pour rien. La mémoire
 *   suffit (MikHmon ne lit pas ce journal ; il a le sien).
 * - Suivi de connexions : TCP établi 1 j → 2 h, flux UDP 3 min → 1 min. Purge
 *   plus vite les flux morts (RAM). N'affecte PAS l'auth hotspot (par IP/MAC).
 * - bandwidth-server : éteint (quasi jamais utilisé, petit CPU).
 * - Cache DNS : 2048 → 1024 Kio (utilisé < 700 Kio partout vu).
 */
export async function ensureResourceTuning(client: RouterOSClient, timeoutMs = 15000): Promise<void> {
  const logRules = await client.talk(["/system/logging/print"], timeoutMs).catch(() => [] as Row[]);
  for (const r of logRules) {
    if (r.action === "disk" && r[".id"]) {
      await client
        .talk(["/system/logging/set", `=numbers=${r[".id"]}`, "=action=memory"], timeoutMs)
        .catch(() => {});
    }
  }
  await client
    .talk(
      ["/ip/firewall/connection/tracking/set", "=tcp-established-timeout=2h", "=udp-stream-timeout=1m"],
      timeoutMs,
    )
    .catch(() => {});
  await client.talk(["/tool/bandwidth-server/set", "=enabled=no"], timeoutMs).catch(() => {});
  await client.talk(["/ip/dns/set", "=cache-size=1024KiB"], timeoutMs).catch(() => {});
}

/**
 * Script RouterOS (une ligne, statements séparés par `;`) qui supprime les
 * scripts de journal MikHmon (`comment=mikhmon`) plus vieux que la fenêtre, par
 * lots de `cap`. Le nom MikHmon commence par la date « mmm/jj/aaaa » ; on en
 * tire mois+année et on compare en (année*12 + mois). L'horloge est lue en ISO
 * (« 2026-10-27 ») ou en legacy (« oct/27/2026 »). On ne supprime que si
 * l'année parse ≥ 2020 : un nom illisible est CONSERVÉ, jamais supprimé par
 * erreur. Fonction PURE pour pouvoir la tester / la rejouer à l'identique.
 */
export function buildJournalCapScript(keepMonths = JOURNAL_KEEP_MONTHS, cap = JOURNAL_CAP_PER_RUN): string {
  return [
    `:local cap ${cap}`,
    `:local mons "janfebmaraprmayjunjulaugsepoctnovdec"`,
    `:local d [/system clock get date]`,
    `:local cy 0`,
    `:local cm 0`,
    `:if ([:pick $d 4 5]="-") do={ :set cy [:tonum [:pick $d 0 4]]; :set cm [:tonum [:pick $d 5 7]] } else={ :set cm (([:find $mons [:pick $d 0 3]]/3)+1); :set cy [:tonum [:pick $d 7 11]] }`,
    `:local cutoff ($cy*12 + $cm - ${keepMonths})`,
    `:local n 0`,
    `:foreach s in=[/system script find where comment="mikhmon"] do={ :if ($n < $cap) do={ :local nm [/system script get $s name]; :local mi [:find $mons [:pick $nm 0 3]]; :if ([:typeof $mi]="num") do={ :local yr [:tonum [:pick $nm 7 11]]; :if ([:typeof $yr]="num") do={ :if ($yr >= 2020) do={ :if (($yr*12 + ($mi/3) + 1) < $cutoff) do={ /system script remove $s; :set n ($n + 1) } } } } } }`,
    `:log info ("${JOURNAL_CAP_NAME} removed=" . $n)`,
  ].join("; ");
}

/**
 * Point 2. Installe (idempotent : purge par nom puis repose) le script de
 * plafonnement et un planificateur quotidien à 04h10 (heure creuse) qui
 * l'exécute. Le drain de l'arriéré se fait sur plusieurs nuits grâce au `cap`.
 */
export async function ensureMikhmonJournalCap(client: RouterOSClient, timeoutMs = 20000): Promise<void> {
  const oldScripts = await client
    .talk(["/system/script/print", `?name=${JOURNAL_CAP_NAME}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const r of oldScripts) {
    if (r[".id"]) await client.talk(["/system/script/remove", `=numbers=${r[".id"]}`], timeoutMs).catch(() => {});
  }
  await client.talk(
    ["/system/script/add", `=name=${JOURNAL_CAP_NAME}`, "=policy=read,write,test,policy", `=source=${buildJournalCapScript()}`],
    timeoutMs,
  );

  const oldSched = await client
    .talk(["/system/scheduler/print", `?name=${JOURNAL_CAP_NAME}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const r of oldSched) {
    if (r[".id"]) await client.talk(["/system/scheduler/remove", `=numbers=${r[".id"]}`], timeoutMs).catch(() => {});
  }
  await client.talk(
    [
      "/system/scheduler/add",
      `=name=${JOURNAL_CAP_NAME}`,
      "=interval=1d",
      "=start-time=04:10:00",
      "=policy=read,write,test,policy",
      `=on-event=/system script run ${JOURNAL_CAP_NAME}`,
      `=comment=${TUNING_COMMENT}`,
    ],
    timeoutMs,
  );
}
