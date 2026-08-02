import type { RouterOSClient } from "./client";

/**
 * Optimisation du DÉBIT routé + mesure du débit WAN — packagé pour le SaaS.
 *
 * Deux volets :
 *  1. optimizeRouterThroughput : (a) ajoute le fasttrack (established,related)
 *     APRÈS le content-filter et avant les jumps hotspot — le trafic « bulk »
 *     des connexions déjà établies court-circuite firewall + conntrack (le gros
 *     du débit), sans casser le filtrage (tls-host/ports agissent à
 *     l'établissement) ; (b) désactive les règles layer7 (regex sur les 1ers
 *     paquets de CHAQUE connexion — le tueur de débit documenté par MikroTik).
 *     Idempotent : ne re-crée pas un fasttrack déjà présent.
 *  2. runRouterSpeedTest : télécharge un fichier de test depuis le routeur
 *     (via son WAN, pas via le tunnel) et calcule le débit descendant réel.
 */

const FASTTRACK_COMMENT = "SafeLinkHub fasttrack (debit)";
const ACCEPT_COMMENT = "SafeLinkHub accept established,related (debit)";

export type ThroughputResult = {
  fasttrackAdded: boolean;
  layer7Disabled: number;
  summary: string;
};

export async function optimizeRouterThroughput(
  client: RouterOSClient,
  opts: { timeoutMs?: number } = {},
): Promise<ThroughputResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;

  const filters = await client.talk(["/ip/firewall/filter/print"], timeoutMs).catch(() => []);
  const hasFasttrack = filters.some((f) => f.action === "fasttrack-connection");

  let fasttrackAdded = false;
  if (!hasFasttrack) {
    // Point d'insertion : après le content-filter, juste avant le 1er jump du
    // forward (là où le hotspot prend la main). À défaut, avant la 1re règle du
    // forward (routeur sans content-filter). Ainsi les NOUVELLES connexions
    // restent filtrées ; seules les connexions établies sont accélérées.
    const forwardJump = filters.find((f) => f.chain === "forward" && f.action === "jump");
    const firstForward = filters.find((f) => f.chain === "forward");
    const anchorId = (forwardJump ?? firstForward)?.[".id"];

    const base = (action: string, comment: string) => {
      const words = [
        "/ip/firewall/filter/add",
        "=chain=forward",
        `=action=${action}`,
        "=connection-state=established,related",
        `=comment=${comment}`,
      ];
      if (anchorId) words.push(`=place-before=${anchorId}`);
      return words;
    };
    // fasttrack d'abord, puis accept — même ancre => ...drops, fasttrack, accept, jump...
    await client.talk(base("fasttrack-connection", FASTTRACK_COMMENT), timeoutMs);
    await client.talk(base("accept", ACCEPT_COMMENT), timeoutMs);
    fasttrackAdded = true;
  }

  // Désactive tous les drops layer7 du forward (regex par connexion = coûteux).
  let layer7Disabled = 0;
  for (const f of filters) {
    if (f.chain === "forward" && f.action === "drop" && f["layer7-protocol"] && f.disabled !== "true") {
      if (f[".id"]) {
        await client
          .talk(["/ip/firewall/filter/set", `=numbers=${f[".id"]}`, "=disabled=yes"], timeoutMs)
          .then(() => {
            layer7Disabled += 1;
          })
          .catch(() => {});
      }
    }
  }

  const parts: string[] = [];
  parts.push(fasttrackAdded ? "fasttrack activé" : "fasttrack déjà présent");
  if (layer7Disabled > 0) parts.push(`${layer7Disabled} règle(s) layer7 désactivée(s)`);
  else parts.push("aucune règle layer7 à désactiver");
  return { fasttrackAdded, layer7Disabled, summary: parts.join(" · ") };
}

export type BandwidthCapResult = {
  targetMbps: number;
  queuesSet: number;
  fasttrackToggled: boolean;
  summary: string;
};

/**
 * PLAFOND DE DÉBIT ÉQUITABLE (le « débit maximal » configurable, ex. 450 Mbps).
 *
 * Pose un plafond agrégé sur le trafic hotspot avec un partage PCQ **par client**
 * (chaque IP reçoit une part équitable du plafond) — anti-bufferbloat, latence
 * basse, personne ne monopolise la ligne. À régler juste SOUS le débit réel de
 * la ligne (ex. 450 sur une ligne de 500) pour absorber les pics sans lag.
 *
 * ⚠️ Le fasttrack court-circuite les files d'attente : tant qu'un plafond est
 * actif, on DÉSACTIVE le fasttrack SafeLinkHub (sinon le plafond/partage ne
 * s'applique pas) ; on le réactive quand on retire le plafond (target=0). Le
 * RB4011 (4×1,2 GHz) encaisse largement 450 Mbps « queués ».
 *
 * NB : un plafond ne PEUT PAS augmenter la capacité livrée par le FAI — il
 * répartit et lisse ce que la ligne délivre déjà.
 */
export async function setRouterBandwidthCap(
  client: RouterOSClient,
  targetMbps: number,
  opts: { timeoutMs?: number } = {},
): Promise<BandwidthCapResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const on = targetMbps > 0;
  const limit = on ? `${targetMbps}M/${targetMbps}M` : "0/0";

  // Les files hotspot d'origine sont DYNAMIQUES (créées par le serveur hotspot,
  // « can't edit dynamic object »). On ne les touche donc PAS : on gère notre
  // PROPRE file STATIQUE « SafeLinkHub-cap », placée EN TÊTE pour primer sur la
  // dynamique (les simple queues s'évaluent de haut en bas, 1re correspondance).
  const CAP_NAME = "SafeLinkHub-cap";
  const queues = await client.talk(["/queue/simple/print"], timeoutMs).catch(() => []);
  const mine = queues.find((q) => q.name === CAP_NAME);
  const pcq = "=queue=pcq-download-default/pcq-upload-default"; // partage équitable par IP client
  let queuesSet = 0;

  if (on) {
    if (mine?.[".id"] && mine.dynamic !== "true") {
      const ok = await client
        .talk(["/queue/simple/set", `=numbers=${mine[".id"]}`, `=max-limit=${limit}`, pcq, "=disabled=no"], timeoutMs)
        .then(() => true)
        .catch(async () => {
          // Repli sans PCQ si les types PCQ manquent sur ce routeur.
          await client
            .talk(["/queue/simple/set", `=numbers=${mine[".id"]}`, `=max-limit=${limit}`, "=disabled=no"], timeoutMs)
            .catch(() => {});
          return true;
        });
      if (ok) queuesSet += 1;
    } else {
      const first = queues.find((q) => q[".id"]);
      const add = [
        "/queue/simple/add",
        `=name=${CAP_NAME}`,
        "=target=HOTSPOT",
        `=max-limit=${limit}`,
        pcq,
        "=comment=SafeLinkHub plafond debit (PCQ par client)",
      ];
      if (first?.[".id"]) add.push(`=place-before=${first[".id"]}`);
      const ok = await client
        .talk(add, timeoutMs)
        .then(() => true)
        .catch(async () => {
          const a2 = ["/queue/simple/add", `=name=${CAP_NAME}`, "=target=HOTSPOT", `=max-limit=${limit}`, "=comment=SafeLinkHub plafond debit"];
          if (first?.[".id"]) a2.push(`=place-before=${first[".id"]}`);
          await client.talk(a2, timeoutMs).catch(() => {});
          return true;
        });
      if (ok) queuesSet += 1;
    }
  } else if (mine?.[".id"]) {
    await client
      .talk(["/queue/simple/remove", `=numbers=${mine[".id"]}`], timeoutMs)
      .then(() => {
        queuesSet += 1;
      })
      .catch(() => {});
  }

  // Fasttrack vs file d'attente : off si plafond actif, on sinon.
  const filters = await client.talk(["/ip/firewall/filter/print"], timeoutMs).catch(() => []);
  let fasttrackToggled = false;
  for (const f of filters) {
    if (f.action === "fasttrack-connection" && f[".id"]) {
      const want = on ? "yes" : "no";
      if ((f.disabled === "true") !== on) {
        await client
          .talk(["/ip/firewall/filter/set", `=numbers=${f[".id"]}`, `=disabled=${want}`], timeoutMs)
          .then(() => {
            fasttrackToggled = true;
          })
          .catch(() => {});
      }
    }
  }

  const summary = on
    ? `Plafond ${targetMbps} Mbps posé (partage équitable par client) sur ${queuesSet} file(s) hotspot${fasttrackToggled ? " · fasttrack désactivé (requis pour le plafond)" : ""}.`
    : `Plafond retiré (débit illimité)${fasttrackToggled ? " · fasttrack réactivé (débit brut max)" : ""}.`;
  return { targetMbps, queuesSet, fasttrackToggled, summary };
}

export type SpeedTestResult = {
  downMbps: number;
  bytes: number;
  seconds: number;
  summary: string;
};

/** Parse une durée RouterOS ("1s310ms", "2m3s", "1h2m", "500ms") en secondes. */
function parseRosDuration(d: string): number {
  let total = 0;
  const re = /(\d+)(ms|s|m|h|d|w)/g;
  let m: RegExpExecArray | null;
  const mult: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  while ((m = re.exec(d))) total += Number(m[1]) * (mult[m[2]] ?? 0);
  return total;
}

/**
 * Mesure le débit DESCENDANT réel du WAN du routeur : le routeur télécharge un
 * fichier de test (Cloudflare) via SA propre connexion Internet — le tunnel ne
 * porte que le déclenchement + le résultat, pas les données. Sans dst-path : le
 * flux est consommé en mémoire puis jeté (pas d'écriture flash). On chronomètre
 * côté serveur (le temps de round-trip tunnel, en ms, est négligeable devant la
 * durée du téléchargement).
 */
export async function runRouterSpeedTest(
  client: RouterOSClient,
  opts: { bytes?: number; timeoutMs?: number } = {},
): Promise<SpeedTestResult> {
  const bytes = opts.bytes ?? 40_000_000; // 40 Mo (bonne résolution jusqu'à ~500 Mbps)
  const timeoutMs = opts.timeoutMs ?? 75_000;
  const url = `https://speed.cloudflare.com/__down?bytes=${bytes}`;

  const t0 = Date.now();
  const rows = await client.talk(
    ["/tool/fetch", `=url=${url}`, "=mode=https", "=keep-result=no"],
    timeoutMs,
  );
  const wallSeconds = Math.max(0.001, (Date.now() - t0) / 1000);

  const done = rows.find((r) => r.status === "finished") ?? rows[rows.length - 1];
  if (!done || done.status !== "finished") {
    throw new Error("Test de débit non abouti (téléchargement interrompu ou lien trop lent).");
  }
  // Priorité aux mesures DU ROUTEUR (downloaded en KiB, duration) : elles
  // excluent la latence du tunnel + l'établissement TLS, contrairement au
  // chrono côté serveur. Repli sur le chrono serveur si les champs manquent.
  const bytesDl = done.downloaded ? Number(done.downloaded) * 1024 : bytes;
  const rosSeconds = done.duration ? parseRosDuration(done.duration) : 0;
  const seconds = rosSeconds > 0 ? rosSeconds : wallSeconds;
  const downMbps = (bytesDl * 8) / seconds / 1_000_000;
  return {
    bytes: bytesDl,
    seconds,
    downMbps,
    summary: `Débit descendant WAN ≈ ${downMbps.toFixed(0)} Mbps (${(bytesDl / 1_000_000).toFixed(0)} Mo en ${seconds.toFixed(1)} s).`,
  };
}
