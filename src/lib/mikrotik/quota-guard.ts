/**
 * GARDE-FOU QUOTA AUTONOME — le routeur se bride TOUT SEUL.
 *
 * Pourquoi ce module existe : le contrôle de consommation principal
 * (`link-usage-reader.ts`) vit CÔTÉ PLATEFORME — il accumule les compteurs WAN
 * en base et pose/retire la file de bridage à chaque sync. Tant que la
 * plateforme relit le routeur, ça marche. Mais si le tunnel/API tombe (VPS en
 * panne, routeur isolé, quota d'appels épuisé), plus RIEN ne freine la
 * consommation : sur un lien facturé au volume (Starlink et ses ~3 To/mois),
 * c'est exactement le moment où on veut un frein.
 *
 * Ce module pose donc SUR LE ROUTEUR, en trois ressources autonomes :
 *
 *   1. une file simple STATIQUE « SafeLinkHub-quota-guard » (disabled par
 *      défaut) qui bride le WAN au débit choisi quand le quota tombe ;
 *   2. un script « /system script » safelinkhub-quota-guard qui lit les
 *      compteurs de l'interface WAN, détecte le changement de mois, et
 *      active/désactive la file ;
 *   3. un scheduler qui lance ce script toutes les N minutes (et au boot).
 *
 * Le comptage est LOCAL au routeur (variables globales slhQuotaBase /
 * slhQuotaMonth + compteurs d'interface) : il ne dépend d'aucun réseau. Les
 * compteurs d'interface repartent à zéro au reboot — le script le détecte
 * (`cur < base`) et réaligne sa référence plutôt que de compter négatif.
 *
 * Commme le filtrage de contenu, ce module ne parle pas au routeur : il
 * construit un PLAN déclaratif, rendu de deux façons garanties identiques
 * (`renderGuardScript` pour le copier-coller, `applyGuardPlan` pour l'API).
 * Tout ce qui est posé porte le commentaire / le nom
 * `safelinkhub-quota-guard`, d'où une dépose totale et idempotente.
 *
 * ─── Limite connue : le fasttrack ───────────────────────────────────────────
 *
 * Une connexion fasttrackée court-circuite les files d'attente : tant qu'une
 * règle fasttrack SafeLinkHub (posée par `optimizeRouterThroughput`) est
 * active, la bride ne mord pas sur les connexions déjà établies. Le script
 * désactive donc AUSSI les règles fasttrack portant le commentaire
 * « SafeLinkHub fasttrack » pendant le bridage, et les réactive au nouveau
 * cycle / sous le quota. C'est le même compromis que
 * `setRouterBandwidthCap` (router-throughput.ts).
 */
import type { RouterOSClient } from "./client";
import { quoteRos } from "./content-filter";

/** Préfixe porté par le script, le scheduler et la file. Clé de la dépose. */
export const QUOTA_GUARD_NAME = "safelinkhub-quota-guard";
/** La FILE simple porte un nom lisible (sans préfixe « safelinkhub- » court). */
export const QUOTA_GUARD_QUEUE_NAME = "SafeLinkHub-quota-guard";
/** Commentaire des règles fasttrack posées par optimizeRouterThroughput. */
const FASTTRACK_COMMENT_PREFIX = "SafeLinkHub fasttrack";

/** Go → Mo (base 1024), Mo → octets. Un quota de « 3 To » = 3 × 1024 × 1024 Mo. */
const BYTES_PER_MB = 1024 * 1024;

/** Réglage du garde-fou. Le quota est mémorisé EN MO (cohérent avec
 *  `routers.wan_quota_mb` côté plateforme) et traduit en octets pour le
 *  script. */
export type QuotaGuardOptions = {
  /** Interface WAN à mesurer (ex. « ether1 »). Détectée sur le routeur. */
  wanInterface: string;
  /** Quota mensuel en MO (3 To = 3 145 728 Mo). */
  capMb: number;
  /** Débit de bride en kbps quand le quota est atteint (ex. 10 000 = 10 Mbps). */
  throttleKbps: number;
  /** Période de vérification en minutes. Défaut : 15. */
  intervalMinutes?: number;
};

export const QUOTA_GUARD_DEFAULT_INTERVAL_MIN = 15;

/** Réglage mémorisé en base (routers.quotaGuard). Même rôle que
 *  `SavedContentFilter` : repli quand le routeur ne répond pas. */
export type SavedQuotaGuard = {
  wanInterface: string;
  capMb: number;
  throttleKbps: number;
  intervalMinutes: number;
  updatedAt: string;
};

// ── Le script RouterOS ──────────────────────────────────────────────────────

/**
 * Corps du script, en UNE SEULE LIGNE (séparateurs « ; ») : la console
 * RouterOS n'accepte pas de littéral multi-lignes dans une chaîne, et l'API
 * n'a pas besoin de saut de ligne non plus. `$` et guillemets passent tels
 * quels côté API ; côté console, `quoteRos` s'en charge au rendu.
 *
 * Logique :
 *   - mois courant = 3 premiers caractères de la date (« sep », « oct »…) —
 *     distincts toute l'année, quel que soit le format d'affichage ;
 *   - si 1er run, changement de mois OU compteurs repartis à zéro (reboot :
 *     `cur < base`) → nouveau cycle : référence = compteur actuel, file
 *     désactivée, fasttrack SafeLinkHub réactivé ;
 *   - sinon, si volume du cycle > quota → file de bride activée + fasttrack
 *     SafeLinkHub coupé ; sinon file désactivée.
 */
export function buildGuardRosScript(opts: QuotaGuardOptions): string {
  const capBytes = Math.round(opts.capMb) * BYTES_PER_MB;
  const ifname = opts.wanInterface;
  const qname = QUOTA_GUARD_QUEUE_NAME;
  const limit = `${Math.round(opts.throttleKbps)}k/${Math.round(opts.throttleKbps)}k`;
  const fastOn = `:foreach r in=[/ip firewall filter find where comment~"^${FASTTRACK_COMMENT_PREFIX}"] do={ /ip firewall filter set $r disabled=no }`;
  const fastOff = `:foreach r in=[/ip firewall filter find where comment~"^${FASTTRACK_COMMENT_PREFIX}"] do={ /ip firewall filter set $r disabled=yes }`;
  return [
    ":global slhQuotaBase",
    ":global slhQuotaMonth",
    `:local capBytes ${capBytes}`,
    `:local ifname "${ifname}"`,
    `:local qname "${qname}"`,
    ":local cur ([/interface get [find name=$ifname] rx-byte] + [/interface get [find name=$ifname] tx-byte])",
    ":local month [:pick [/system clock get date] 0 3]",
    `:if ([:typeof $slhQuotaBase] = "nothing" || [:typeof $slhQuotaMonth] = "nothing" || $slhQuotaMonth != $month || $cur < $slhQuotaBase) do={ :set slhQuotaBase $cur; :set slhQuotaMonth $month; /queue simple set [find name=$qname] max-limit=${limit} disabled=yes; ${fastOn}; :log info "SafeLinkHub garde quota: nouveau cycle, compteur reinitialise" }`,
    ":local used ($cur - $slhQuotaBase)",
    `:if ($used > $capBytes) do={ /queue simple set [find name=$qname] max-limit=${limit} disabled=no; ${fastOff}; :log warning "SafeLinkHub garde quota: quota mensuel atteint, debit reduit" } else={ /queue simple set [find name=$qname] disabled=yes; ${fastOn} }`,
  ].join("; ");
}

// ── Le plan ─────────────────────────────────────────────────────────────────

export type GuardStep =
  | { kind: "add"; path: string; params: Record<string, string> }
  /** `remove [find <field>=<value>]`. */
  | { kind: "remove-where"; path: string; field: string; value: string };

export type QuotaGuardPlan = {
  steps: GuardStep[];
  /** Le script RouterOS posé (identique à ce que contient le routeur). */
  rosScript: string;
  notes: string[];
};

const MANAGED: { path: string; field: string }[] = [
  { path: "/system/scheduler", field: "name" },
  { path: "/system/script", field: "name" },
  { path: "/queue/simple", field: "name" },
];

function removalSteps(): GuardStep[] {
  return MANAGED.map(
    (m) => ({ kind: "remove-where", path: m.path, field: m.field, value: QUOTA_GUARD_NAME }) as GuardStep,
  );
}

/**
 * Pose idempotente : on purge d'abord nos trois ressources (par nom), puis on
 * re-crée file → script → scheduler. La file est créée DÉSACTIVÉE : le
 * scheduler décide de l'activer, pas la pose.
 */
export function buildGuardInstallPlan(opts: QuotaGuardOptions): QuotaGuardPlan {
  const interval = Math.max(1, Math.round(opts.intervalMinutes ?? QUOTA_GUARD_DEFAULT_INTERVAL_MIN));
  const limit = `${Math.round(opts.throttleKbps)}k/${Math.round(opts.throttleKbps)}k`;
  const rosScript = buildGuardRosScript(opts);
  const notes = [
    `Vérification toutes les ${interval} minutes (scheduler sur le routeur) — le bridage reste actif même si la plateforme est injoignable.`,
    "Compteurs repartis à zéro au reboot : le script réaligne sa référence au prochain passage (la conso du cycle est alors sous-estimée d'autant).",
    "Le fasttrack SafeLinkHub est coupé pendant le bridage (sinon la file ne mord pas) et réactivé au nouveau cycle.",
  ];
  return {
    rosScript,
    notes,
    steps: [
      ...removalSteps(),
      // La file de bride, placée en TÊTE pour primer sur les files dynamiques
      // du hotspot (1re correspondance gagne), et DÉSACTIVÉE à la pose.
      {
        kind: "add",
        path: "/queue/simple",
        params: {
          name: QUOTA_GUARD_QUEUE_NAME,
          target: opts.wanInterface,
          "max-limit": limit,
          "queue": "default-small/default-small",
          disabled: "yes",
          comment: "SafeLinkHub garde quota (bride au quota WAN)",
        },
      },
      {
        kind: "add",
        path: "/system/script",
        params: { name: QUOTA_GUARD_NAME, source: rosScript, comment: "SafeLinkHub garde quota" },
      },
      {
        kind: "add",
        path: "/system/scheduler",
        params: {
          name: QUOTA_GUARD_NAME,
          "start-time": "startup",
          interval: `${interval}m`,
          "on-event": QUOTA_GUARD_NAME,
          comment: "SafeLinkHub garde quota",
        },
      },
    ],
  };
}

/** Dépose totale : script, scheduler et file identifiés par leur nom. */
export function buildGuardRemovalPlan(): QuotaGuardPlan {
  return {
    rosScript: "",
    notes: ["Le garde-fou est retiré : le script, le scheduler et la file portant « " + QUOTA_GUARD_NAME + " » sont supprimés."],
    steps: removalSteps(),
  };
}

// ── Sortie 1 : le script .rsc copier-coller ─────────────────────────────────

function consolePath(path: string): string {
  return "/" + path.replace(/^\//, "").split("/").join(" ");
}

function renderParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${quoteRos(v)}`)
    .join(" ");
}

export function renderGuardStep(step: GuardStep): string {
  const base = consolePath(step.path);
  switch (step.kind) {
    case "add":
      return `${base} add ${renderParams(step.params)}`;
    case "remove-where":
      return `${base} remove [find ${step.field}=${quoteRos(step.value)}]`;
  }
}

/**
 * Script `.rsc` prêt à coller dans le terminal. Chaque étape est enveloppée
 * dans `:do {[:parse …]} on-error={}` comme le fait content-filter : une
 * ressource déjà absente à la purge ne doit pas interrompre le reste.
 */
export function renderGuardScript(plan: QuotaGuardPlan): string {
  const header = [
    "# SafeLinkHub — garde-fou quota autonome",
    "# Pose un script + scheduler sur le routeur : le bridage tient meme si la plateforme est hors ligne.",
    "# Pour tout retirer : supprimer script/scheduler/file « " + QUOTA_GUARD_NAME + " ».",
  ];
  const run = (line: string) => `:do {:local c [:parse ${quoteRos(line)}]; $c} on-error={}`;
  const body = plan.steps.map((s) => run(renderGuardStep(s)));
  return [...header, ...body, `:log info "SafeLinkHub garde quota posee"`].join("\n");
}

// ── Sortie 2 : application via l'API RouterOS ───────────────────────────────

export type GuardApplyResult = { applied: number; failed: { step: string; error: string }[] };

function apiWords(params: Record<string, string>): string[] {
  return Object.entries(params).map(([k, v]) => `=${k}=${v}`);
}

async function idsWhere(
  client: RouterOSClient,
  path: string,
  field: string,
  value: string,
  timeoutMs: number,
): Promise<string[]> {
  const rows = await client
    .talk([`${path}/print`, `?${field}=${value}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  return rows.map((r) => r[".id"]).filter((id): id is string => Boolean(id));
}

/** Exécute le plan via l'API. Les échecs sont collectés, pas levés. */
export async function applyGuardPlan(
  client: RouterOSClient,
  plan: QuotaGuardPlan,
  timeoutMs = 15000,
): Promise<GuardApplyResult> {
  const result: GuardApplyResult = { applied: 0, failed: [] };
  for (const step of plan.steps) {
    const label = renderGuardStep(step);
    try {
      if (step.kind === "add") {
        await client.talk([`${step.path}/add`, ...apiWords(step.params)], timeoutMs);
      } else {
        for (const id of await idsWhere(client, step.path, step.field, step.value, timeoutMs)) {
          await client.talk([`${step.path}/remove`, `=numbers=${id}`], timeoutMs).catch(() => {});
        }
      }
      result.applied++;
    } catch (err) {
      result.failed.push({ step: label, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

// ── Lecture de l'état réel sur le routeur ───────────────────────────────────

export type QuotaGuardState = {
  installed: boolean;
  scriptPresent: boolean;
  schedulerPresent: boolean;
  /** true si la file de bride est actuellement ACTIVE (quota dépassé). */
  throttled: boolean;
  queueDisabled: boolean | null;
  /** Compteur brut de l'interface WAN (rx+tx), null si illisible. */
  wanRawBytes: number | null;
  /** Volume consommé depuis le début du cycle, selon le routeur. null si le
   *  script ne s'est encore jamais exécuté (variables globales absentes). */
  usedBytes: number | null;
  /** Mois du cycle courant tel que le routeur le voit (« sep »…), null si
   *  jamais initialisé. */
  cycleMonth: string | null;
};

/**
 * Relit l'état SUR le routeur : présence des trois ressources + variables du
 * script (environment) + compteurs WAN. `wanInterface` sert à lire les
 * compteurs ; sans lui, usedBytes reste null.
 */
export async function readQuotaGuardState(
  client: RouterOSClient,
  wanInterface: string | null,
  timeoutMs = 15000,
): Promise<QuotaGuardState> {
  const scriptRows = await client.talk(["/system/script/print", `?name=${QUOTA_GUARD_NAME}`], timeoutMs).catch(() => []);
  const schedRows = await client
    .talk(["/system/scheduler/print", `?name=${QUOTA_GUARD_NAME}`], timeoutMs)
    .catch(() => []);
  const queueRows = await client
    .talk(["/queue/simple/print", `?name=${QUOTA_GUARD_QUEUE_NAME}`], timeoutMs)
    .catch(() => []);
  const queue = queueRows[0];

  // Variables globales du script : /system script environment (v6 et v7).
  const envRows = await client.talk(["/system/script/environment/print"], timeoutMs).catch(() => []);
  const env = new Map(envRows.map((r) => [r.name, r.value] as const));
  const base = env.has("slhQuotaBase") ? Number(env.get("slhQuotaBase")) : null;
  const cycleMonth = env.get("slhQuotaMonth") ?? null;

  let wanRawBytes: number | null = null;
  let usedBytes: number | null = null;
  if (wanInterface) {
    const rows = await client
      .talk(["/interface/print", "=stats=", `?name=${wanInterface}`], timeoutMs)
      .catch(() => [] as Record<string, string>[]);
    const rx = Number(rows[0]?.["rx-byte"] ?? NaN);
    const tx = Number(rows[0]?.["tx-byte"] ?? NaN);
    if (Number.isFinite(rx) && Number.isFinite(tx)) {
      wanRawBytes = rx + tx;
      if (base !== null && Number.isFinite(base)) {
        usedBytes = Math.max(0, wanRawBytes - base);
      }
    }
  }

  const scriptPresent = scriptRows.length > 0;
  const schedulerPresent = schedRows.length > 0;
  const queueDisabled = queue ? queue.disabled !== "false" : null;

  return {
    installed: scriptPresent && schedulerPresent && Boolean(queue),
    scriptPresent,
    schedulerPresent,
    throttled: Boolean(queue) && queue.disabled === "false",
    queueDisabled,
    wanRawBytes,
    usedBytes,
    cycleMonth,
  };
}

/** Quota mensuel en Mo → libellé lisible (« 3 To » pour 3 145 728 Mo). */
export function quotaGuardCapLabel(capMb: number): string {
  if (!Number.isFinite(capMb) || capMb <= 0) return "illimité";
  if (capMb >= 1024 * 1024) {
    const to = capMb / (1024 * 1024);
    return `${Number.isInteger(to) ? to : to.toFixed(1).replace(".", ",")} To`;
  }
  if (capMb >= 1024) return `${Math.round((capMb / 1024) * 10) / 10} Go`.replace(".0", "");
  return `${capMb} Mo`;
}
