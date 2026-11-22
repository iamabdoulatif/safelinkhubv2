// MISE À JOUR AUTOMATIQUE de MikHmon sur le parc (demande opérateur 28/10/2026).
//
// DEUX mécanismes, du plus sûr au plus lourd :
//
// 1. DÉPÔT DE FICHIERS (ensureMikhmonUiFiles) — pour une REFONTE D'HABILLAGE.
//    L'app pousse les fichiers de présentation (CSS + headhtml + sessions) DANS
//    le conteneur EN MARCHE via `/tool fetch` (le routeur télécharge depuis
//    getAppUrl()/mikhmon-ui/*). Overlay : les fichiers atterrissent dans la
//    couche supérieure du root-dir, le conteneur les sert aussitôt.
//      → Ne touche NI config.php (sessions), NI les scripts de vente, NI les
//        planificateurs d'expiration, NI les profils hotspot (tout sur le
//        ROUTEUR). Rien à re-synchroniser, zéro perte. Versionné MIKHMON_UI_VERSION.
//
// 2. MISE À JOUR DE L'IMAGE (ensureMikhmonImage) — pour une REFONTE TOTALE.
//    Re-crée le conteneur sur l'image voulue par le MÊME chemin que le bouton
//    « Réinstaller MikHmon » (migrateMikhmonToFlash, force + image) : config du
//    registre et des couches, stop/remove réessayés, add avec l'interface du
//    conteneur d'origine ; si l'add échoue, l'ancienne image est remise.
//    La ré-extraction remet config.php au modèle : la session « SafeLinkHub »
//    est REPOSÉE ensuite (repostMikhmonSession), dès que le conteneur tourne.
//    Ventes / expirations / profils vivent sur le ROUTEUR → intacts.
//    GARDE-FOUS : seules les images de la famille sf-v1 sont remplacées (jamais
//    les éditions v3) ; au plus IMAGE_UPDATE_MAX_PER_WINDOW re-créations par
//    fenêtre ; au premier échec, coupe-circuit pour le reste du process.
//
// Versionné + une fois par routeur et par process (comme le durcissement).

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getAppUrl } from "@/lib/net/app-url";
import type { RouterOSClient } from "./client";
import { migrateMikhmonToFlash, readdMikhmonContainer, MIKHMON_DOCKERHUB_IMAGE } from "./mikhmon-flash";
import { repostMikhmonSession } from "./mikhmon-session-repost";

type Sentence = Record<string, string>;

/** À incrémenter à chaque refonte d'HABILLAGE (re-dépose les fichiers UI).
 * ui-2 : la skin est désormais INLINE dans headhtml.php (un <style>), plus un
 * fichier css/safelink-skin.css séparé — un ÉCRASEMENT de headhtml.php est servi
 * à chaud, alors qu'un fichier CSS NEUF restait 404 tant que le conteneur
 * n'avait pas redémarré, et ce redémarrage n'aboutissait pas partout (vu sur
 * DIAK-HSPT). Plus de redémarrage requis. */
export const MIKHMON_UI_VERSION = "ui-7";
/* ui-4 (21/11/2026) : + correction du prix des tickets (division par 100) sur
 * les conteneurs Docker Hub latif225/mikhmon-sf-v1, modèles non personnalisés
 * uniquement.
 * ui-3 (21/11/2026) : + dépôt des fichiers du RAPPORT DE VENTE (filtres période
 * et vendeur, mikhmon-sf-v1 81632b5) sur la famille sf-v1 uniquement, sans
 * re-création : vendeurs, gérants, journaux et ventes restent en place. */
/** Image conteneur voulue sur tout le parc (tag immuable recommandé).
 * ui-1 : prix-corrige + habillage SafeLinkHub CUIT dans l'image (skin inline).
 * On bascule le parc dessus par re-création de conteneur (mécanisme 2) car le
 * dépôt de fichiers à chaud s'est révélé non fiable (l'overlay du conteneur
 * continuait de servir le headhtml cuit dans prix-corrige).
 * ui-2 (2026-11-21) : même recette, reconstruite sur latif225/mikhmon-sf-v1
 * qui porte le filtre de revenu par période du rapport de vente. */
export const MIKHMON_DESIRED_IMAGE = "ghcr.io/iamabdoulatif/mikhmon-v7:ui-2";

const UI_SYNC_ENABLED = true;

/** Mécanisme 2. Historique 2026-11-21 : deux échecs sur GUEASSO-HSPT avec une
 * re-création maison (remove trop tôt, puis add refusé) ; elle passe désormais
 * par migrateMikhmonToFlash, le chemin de « Réinstaller MikHmon » qui a réparé
 * ce même routeur. */
const IMAGE_UPDATE_ENABLED = false; // PAUSE 2026-11-21 12:00 : sauvegarder vendeurs/gérants/journaux avant re-création
/** Images remplacées par MIKHMON_DESIRED_IMAGE : la famille sf-v1 et ses
 * dérivés SafeLinkHub. Les éditions v3 (latif225/mikhmonv3-safelinkhub,
 * naufkia/mikhmonv3) ne sont PAS dans la liste : leur code n'est pas le même. */
export const IMAGE_UPDATE_SOURCE_IMAGES = [
  "latif225/mikhmon-sf-v1:latest",
  "ghcr.io/iamabdoulatif/mikhmon-v7:prix-corrige",
  "ghcr.io/iamabdoulatif/mikhmon-v7:latest",
  "ghcr.io/iamabdoulatif/mikhmon-v7:ui-1",
];
/** Routeurs laissés SANS conteneur MikHmon par une mise à jour d'image : la
 * synchronisation y recrée le conteneur (readdMikhmonContainer). Sans effet dès
 * qu'un conteneur existe. */
const MIKHMON_REINSTALL_IDS: string[] = [
  "52d71a14-a71f-48cd-96c6-93d0cb19be16", // HSPT-DUBONHEUR (21/11/2026, layer-dir overlap)
  "4840d6f8-9110-4053-8cbe-9f254695a33e", // HSPT-BENY (sans conteneur, forward MikHmon 39024 actif)
];

/** Recrée le conteneur MikHmon disparu, puis marque la session à reposer. */
async function readdMissingMikhmon(
  client: RouterOSClient,
  routerId: string,
  why: string,
  old: { rootDir?: string; image?: string } = {},
): Promise<string> {
  const res = await readdMikhmonContainer(client, {
    // Docker Hub : joignable même des routeurs qui n'atteignent pas ghcr.io.
    image: old.image && !/^ghcr\.io\//.test(old.image) ? old.image : MIKHMON_DOCKERHUB_IMAGE,
    rootDir: old.rootDir,
    timeoutMs: 45000,
  }).catch((e: unknown) => ({ status: "failed" as const, message: `add: ${e instanceof Error ? e.message : String(e)}` }));
  console.warn(JSON.stringify({ level: "info", msg: "mikhmon auto-readd", routerId, why, result: res }));
  if (res.status !== "failed") {
    try {
      await getDb().update(routers).set({ mikhmonSessionAt: null }).where(eq(routers.id, routerId));
    } catch {
      /* la session pourra être reposée par le bouton */
    }
  }
  return res.status;
}

/** Déploiement progressif : au plus N re-créations par fenêtre glissante. */
const IMAGE_UPDATE_MAX_PER_WINDOW = 3;
const IMAGE_UPDATE_WINDOW_MS = 10 * 60_000;

/** Fichiers d'habillage : servis par l'app, déposés dans le conteneur. */
// La skin voyage INLINE dans headhtml.php (voir MIKHMON_UI_VERSION) : on ne
// dépose que des ÉCRASEMENTS de fichiers existants, servis à chaud sans
// redémarrage. On ne dépose plus css/safelink-skin.css (fichier neuf = 404 tant
// que le conteneur n'a pas redémarré).
const UI_FILES: { url: string; dst: string }[] = [
  { url: "mikhmon-ui/headhtml.txt", dst: "include/headhtml.php" },
  { url: "mikhmon-ui/sessions.txt", dst: "settings/sessions.php" },
];

/** Fichiers du rapport de vente (copie de mikhmon-sf-v1, public/mikhmon-code). */
const CODE_FILES: { url: string; dst: string }[] = [
  { url: "mikhmon-code/seller_summary.txt", dst: "report/seller_summary.php" },
  { url: "mikhmon-code/mikhmon_compat.txt", dst: "include/mikhmon_compat.php" },
  { url: "mikhmon-code/selling.txt", dst: "report/selling.php" },
  { url: "mikhmon-code/print.txt", dst: "report/print.php" },
];

/** Correction du prix (même résultat que deploy/mikhmon-v7/patch-modeles.php),
 * pour les conteneurs sur l'image Docker Hub — prix-corrige et ui-* l'ont déjà. */
const PRICE_FIX_IMAGE = "latif225/mikhmon-sf-v1:latest";
const PRICE_FIX_SHARED = { url: "mikhmon-code/voucher/couleurs-prix.txt", dst: "voucher/couleurs-prix.php" };
/** Modèles corrigés, avec la taille EXACTE de l'original (inchangé depuis le
 * 17/05/2026). Un modèle d'une autre taille a été personnalisé dans l'éditeur
 * de tickets : on n'y touche pas. */
const PRICE_FIX_TEMPLATES: { url: string; dst: string; stockSize: number }[] = [
  { url: "mikhmon-code/voucher/template.txt", dst: "voucher/template.php", stockSize: 8894 },
  { url: "mikhmon-code/voucher/template-small.txt", dst: "voucher/template-small.php", stockSize: 8133 },
  { url: "mikhmon-code/voucher/safetmp.txt", dst: "voucher/safetmp.php", stockSize: 8838 },
];

/** Conteneur de la famille sf-v1 (jamais les éditions v3, dont le code diffère). */
function isSfFamilyImage(img: string | null | undefined): boolean {
  return !!img && (img === MIKHMON_DESIRED_IMAGE || IMAGE_UPDATE_SOURCE_IMAGES.includes(img));
}

let recentRecreates: number[] = [];
/** Coupe-circuit : un échec arrête les re-créations jusqu'au prochain process. */
let imageUpdateTripped = false;

type Container = { id: string; rootDir: string; remoteImage: string; running: boolean };

/** Conteneur MikHmon du routeur. root-dir sans « / » de tête. */
export async function findMikhmonContainer(client: RouterOSClient, timeoutMs = 15000): Promise<Container | null> {
  const rows = await client.talk(["/container/print", "detail"], timeoutMs).catch(() => [] as Sentence[]);
  const mk = rows.find(
    (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
  );
  if (!mk || !mk[".id"]) return null;
  let rootDir = String(mk["root-dir"] ?? "");
  if (rootDir.startsWith("/")) rootDir = rootDir.slice(1);
  if (!rootDir) return null;
  return {
    id: mk[".id"],
    rootDir,
    remoteImage: String(mk["remote-image"] ?? ""),
    running: mk.running === "true",
  };
}

/* ═══════════════════════ Mécanisme 1 : dépôt de fichiers ════════════════ */

/** Dépose les fichiers d'habillage dans le conteneur en marche. Sûr (présentation
 * uniquement). Renvoie le nombre de fichiers posés, ou -1 si pas de conteneur. */
export async function ensureMikhmonUiFiles(client: RouterOSClient, timeoutMs = 20000): Promise<number> {
  const c = await findMikhmonContainer(client, timeoutMs);
  if (!c) return -1;
  const base = getAppUrl().replace(/\/+$/, "");
  let ok = 0;
  for (const f of UI_FILES) {
    const r = await client
      .talk(["/tool/fetch", `=url=${base}/${f.url}`, `=dst-path=${c.rootDir}/src/src/${f.dst}`, "=keep-result=no"], timeoutMs)
      .then(() => true)
      .catch(() => false);
    if (r) ok++;
  }
  return ok;
}

/**
 * Corrige le prix des tickets sur un conteneur Docker Hub : dépose
 * couleurs-prix.php puis chaque modèle resté d'origine. Pas de redémarrage ici
 * (ensureMikhmonCodeFiles redémarre juste après). Renvoie le nombre de modèles
 * corrigés, 0 si non concerné, -1 en cas d'échec de dépôt.
 */
export async function ensureMikhmonPriceFix(client: RouterOSClient, timeoutMs = 30000): Promise<number> {
  const c = await findMikhmonContainer(client, timeoutMs);
  if (!c || c.remoteImage !== PRICE_FIX_IMAGE) return 0;
  const base = getAppUrl().replace(/\/+$/, "");
  const path = (dst: string) => `${c.rootDir}/src/src/${dst}`;
  const todo: typeof PRICE_FIX_TEMPLATES = [];
  for (const f of PRICE_FIX_TEMPLATES) {
    const rows = await client.talk(["/file/print", `?name=${path(f.dst)}`], timeoutMs).catch(() => [] as Sentence[]);
    if (Number(rows[0]?.size) === f.stockSize) todo.push(f);
  }
  if (todo.length === 0) return 0;
  const fetch = (f: { url: string; dst: string }) =>
    client
      .talk(["/tool/fetch", `=url=${base}/${f.url}`, `=dst-path=${path(f.dst)}`], timeoutMs)
      .then(() => true)
      .catch(() => false);
  // La table des couleurs d'abord : un modèle corrigé sans elle planterait.
  if (!(await fetch(PRICE_FIX_SHARED))) return -1;
  let ok = 0;
  for (const f of todo) if (await fetch(f)) ok++;
  return ok === todo.length ? ok : -1;
}

/**
 * Dépose les fichiers du rapport de vente dans le conteneur (famille sf-v1
 * uniquement), puis le redémarre (stop/start, SANS remove : rien n'est perdu)
 * pour purger l'opcache. Renvoie le nombre de fichiers posés, 0 si le conteneur
 * n'est pas éligible, -1 s'il n'y en a pas.
 * `keep-result` reste à sa valeur par défaut (yes) : avec « no », /tool fetch
 * n'écrit PAS le fichier.
 */
export async function ensureMikhmonCodeFiles(
  client: RouterOSClient,
  deps: { restart?: (c: RouterOSClient) => Promise<boolean>; timeoutMs?: number } = {},
): Promise<number> {
  const t = deps.timeoutMs ?? 30000;
  const c = await findMikhmonContainer(client, t);
  if (!c) return -1;
  if (!isSfFamilyImage(c.remoteImage)) return 0;
  const base = getAppUrl().replace(/\/+$/, "");
  let ok = 0;
  for (const f of CODE_FILES) {
    const r = await client
      .talk(["/tool/fetch", `=url=${base}/${f.url}`, `=dst-path=${c.rootDir}/src/src/${f.dst}`], t)
      .then(() => true)
      .catch(() => false);
    if (r) ok++;
  }
  if (ok === CODE_FILES.length) await (deps.restart ?? restartMikhmonContainer)(client).catch(() => false);
  return ok;
}

/* ═══════════════════════ Mécanisme 2 : mise à jour image ════════════════ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend que le conteneur soit RÉELLEMENT arrêté (le stop est asynchrone, et
 * `/container remove` refuse tant qu'il n'est pas « stopped »). `running` passe
 * à faux dès l'état « stopping » : c'est ce qui a fait échouer le remove sur
 * GUEASSO-HSPT le 2026-11-21. On exige donc le statut « stopped » quand RouterOS
 * le donne. */
async function waitStopped(client: RouterOSClient, id: string, maxMs = 60000, pollMs = 3000): Promise<boolean> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    await sleep(pollMs);
    const rows = await client.talk(["/container/print", `?.id=${id}`]).catch(() => [] as Sentence[]);
    const r = rows[0];
    if (!r) return true;
    const status = String(r.status ?? "");
    if (status ? status === "stopped" : r.running !== "true") return true;
  }
  return false;
}

/** Attend que le conteneur tourne, en relançant `start` (inoffensif tant que
 * l'image s'extrait encore). */
async function waitRunning(client: RouterOSClient, maxMs = 180000, pollMs = 10000): Promise<boolean> {
  if (maxMs <= 0) return (await findMikhmonContainer(client).catch(() => null))?.running ?? false;
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const c = await findMikhmonContainer(client).catch(() => null);
    if (c?.running) return true;
    if (c?.id) await client.talk(["/container/start", `=numbers=${c.id}`]).catch(() => {});
    await sleep(pollMs);
  }
  return false;
}

/**
 * Redémarre le conteneur MikHmon (stop/start) pour qu'il SERVE les fichiers
 * d'habillage NEUFS déposés. Un fichier qui n'existait pas dans l'image (ex.
 * `css/safelink-skin.css`) reste 404 tant que le conteneur tourne : l'overlay
 * du conteneur en marche ne révèle pas un nouveau fichier déposé dans son
 * root-dir (les ÉCRASEMENTS de fichiers existants, eux, sont servis à chaud).
 * Un simple stop/start re-fusionne l'overlay sans ré-extraire l'image. Bornes
 * courtes ; best-effort. Vérifié sur ASSOINDE (skin 404 → 200 après redémarrage).
 */
export async function restartMikhmonContainer(client: RouterOSClient): Promise<boolean> {
  const c = await findMikhmonContainer(client);
  if (!c?.id) return false;
  await client.talk(["/container/stop", `=numbers=${c.id}`]).catch(() => {});
  await waitStopped(client, c.id, 20000, 2000);
  await client.talk(["/container/start", `=numbers=${c.id}`]).catch(() => {});
  return waitRunning(client, 45000, 5000);
}

/**
 * Met l'image à jour si le conteneur tourne sur une image de la famille sf-v1
 * différente de l'image voulue — borné par la fenêtre et le coupe-circuit.
 * `now` et `migrate` sont injectables pour les tests.
 */
export async function ensureMikhmonImage(
  client: RouterOSClient,
  routerId: string,
  deps: { now?: number; migrate?: typeof migrateMikhmonToFlash } = {},
): Promise<string> {
  if (!IMAGE_UPDATE_ENABLED) return "disabled";
  if (imageUpdateTripped) return "circuit-open";
  const c = await findMikhmonContainer(client);
  if (!c) return "no-container";
  if (c.remoteImage === MIKHMON_DESIRED_IMAGE) return "already-current";
  if (!IMAGE_UPDATE_SOURCE_IMAGES.includes(c.remoteImage)) return "not-eligible";
  const now = deps.now ?? Date.now();
  recentRecreates = recentRecreates.filter((t) => now - t < IMAGE_UPDATE_WINDOW_MS);
  if (recentRecreates.length >= IMAGE_UPDATE_MAX_PER_WINDOW) return "cap-reached";
  recentRecreates.push(now);

  const res = await (deps.migrate ?? migrateMikhmonToFlash)(client, {
    force: true,
    image: MIKHMON_DESIRED_IMAGE,
    maxWaitMs: 240000,
  });
  if (res.status === "migrated" || res.status === "pulling") {
    // La session sera reposée par reconcileMikhmonAutoUpdate dès que le
    // conteneur tournera (marqueur : mikhmon_session_at remis à NULL).
    try {
      await getDb().update(routers).set({ mikhmonSessionAt: null }).where(eq(routers.id, routerId));
    } catch {
      /* sans marqueur, la session sera reposée par le bouton ; on n'échoue pas la mise à jour */
    }
    return "updated";
  }
  imageUpdateTripped = true;
  console.error(JSON.stringify({ level: "warn", msg: "mikhmon image update failed", routerId, result: res }));
  // Ne jamais laisser le routeur sans MikHmon : si plus aucun conteneur
  // n'existe, réinstallation complète.
  if (!deps.migrate && !(await findMikhmonContainer(client))) {
    await readdMissingMikhmon(client, routerId, "image update left no container", { rootDir: c.rootDir, image: c.remoteImage }).catch(() => "error");
  }
  return "failed";
}

/** Tests uniquement : remet la fenêtre et le coupe-circuit à zéro. */
export function resetImageUpdateStateForTests(): void {
  recentRecreates = [];
  imageUpdateTripped = false;
}

/* ═══════════════════════ Orchestrateur (appelé à la synchro) ════════════ */

/**
 * Relève l'état du conteneur dans la base (inventaire du parc).
 *
 * Appelé APRÈS l'éventuelle mise à jour d'image, pour que l'image enregistrée
 * soit celle qui tourne vraiment à la fin du passage.
 *
 * Pas de conteneur = on écrit des NULL mais on horodate quand même : « relevé,
 * sans conteneur » et « jamais relevé » sont deux états distincts, et seul
 * `mikhmonSeenAt` les sépare.
 *
 * Ne lève jamais : un inventaire manquant ne doit pas faire échouer une synchro.
 */
export async function recordMikhmonInventory(client: RouterOSClient, routerId: string): Promise<void> {
  try {
    const c = await findMikhmonContainer(client).catch(() => null);
    await getDb()
      .update(routers)
      .set({
        mikhmonImage: c?.remoteImage || null,
        mikhmonRootDir: c?.rootDir || null,
        mikhmonContainerRunning: c ? c.running : null,
        mikhmonSeenAt: new Date(),
      })
      .where(eq(routers.id, routerId));
  } catch {
    /* inventaire best-effort */
  }
}

export async function reconcileMikhmonAutoUpdate(client: RouterOSClient, routerId: string): Promise<void> {
  // 0) Routeur laissé sans conteneur par une mise à jour : réinstallation.
  if (MIKHMON_REINSTALL_IDS.includes(routerId) && !(await findMikhmonContainer(client))) {
    await readdMissingMikhmon(client, routerId, "listed in MIKHMON_REINSTALL_IDS").catch(() => "error");
  }
  // 1) Image D'ABORD : si on re-crée le conteneur, il repart sur l'image NUE
  //    (l'habillage n'est pas cuit dedans) — il faut re-déposer les fichiers
  //    ensuite. L'image a son propre garde-fou (allowlist + cap).
  let imageUpdated = false;
  if (IMAGE_UPDATE_ENABLED) {
    const res = await ensureMikhmonImage(client, routerId).catch(() => "error");
    imageUpdated = res === "updated";
  }
  // 2) Habillage : déposer les fichiers de présentation (ÉCRASEMENTS de fichiers
  //    existants → servis à chaud, AUCUN redémarrage requis, la skin est inline
  //    dans headhtml.php). Borné à UNE fois par version via
  //    routers.mikhmon_ui_version (PERSISTÉ) : un simple redéploiement de l'app
  //    ne re-dépose donc pas sur les 59 conteneurs. Se relance aussi si le
  //    conteneur vient d'être re-créé (neuf, sans habillage).
  if (UI_SYNC_ENABLED) {
    const [row] = await getDb()
      .select({ v: routers.mikhmonUiVersion })
      .from(routers)
      .where(eq(routers.id, routerId))
      .limit(1)
      .catch(() => [] as { v: string | null }[]);
    if (imageUpdated || row?.v !== MIKHMON_UI_VERSION) {
      const n = await ensureMikhmonUiFiles(client).catch(() => -1);
      const price = await ensureMikhmonPriceFix(client).catch(() => -1);
      const code = await ensureMikhmonCodeFiles(client).catch(() => -1);
      // Version posée seulement si le rapport est complet (ou non concerné : v3).
      if (n > 0 && price >= 0 && (code === 0 || code === CODE_FILES.length)) {
        await getDb()
          .update(routers)
          .set({ mikhmonUiVersion: MIKHMON_UI_VERSION })
          .where(eq(routers.id, routerId))
          .catch(() => {});
      }
    }
  }
  // 3) Session : un conteneur recréé repart sans session SafeLinkHub. Dès qu'il
  //    tourne sur l'image voulue, on la repose (une fois : le marqueur
  //    mikhmon_session_at repasse à une date).
  try {
    const [r] = await getDb().select().from(routers).where(eq(routers.id, routerId)).limit(1);
    const sfFamily = isSfFamilyImage;
    if (r && r.mikhmonSessionAt === null && sfFamily(r.mikhmonImage)) {
      const c = await findMikhmonContainer(client);
      if (c?.running && sfFamily(c.remoteImage)) {
        const res = await repostMikhmonSession(client, r);
        if (!res.ok) console.error(JSON.stringify({ level: "warn", msg: "mikhmon session repost failed", routerId, error: res.error }));
      }
    }
  } catch {
    /* best-effort : retenté à la prochaine synchro */
  }
  // 4) Inventaire : on garde l'état du conteneur au lieu de le jeter. Une
  //    lecture /container/print de plus toutes les 5 min, contre la seule
  //    réponse fiable à « quelle génération tourne sur quel routeur ? ».
  await recordMikhmonInventory(client, routerId);
}
