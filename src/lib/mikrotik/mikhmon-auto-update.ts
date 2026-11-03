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
//    Re-crée le conteneur sur l'image voulue. La re-création RÉ-EXTRAIT l'image →
//    config.php (sessions) revient au modèle (vérifié sur COUZA : l'envlist ne
//    REPEUPLE PAS au ré-extract, seulement au tout premier boot). On préserve
//    donc la session par SAUVEGARDE → RESTAURATION verbatim :
//      a. lit config.php (API /file/get),
//      b. stop (attend l'arrêt réel) + remove + add (même interface/root-dir +
//         envlist mikhmon + nouvelle image) + attend le running,
//      c. restaure config.php verbatim via un script `/file set` ÉCHAPPÉ (seule
//         écriture qui atteint le container-store ; /file/set direct ne le voit
//         pas). Sessions + mot de passe admin préservés à l'identique.
//    Ventes / expirations / profils vivent sur le ROUTEUR → intacts.
//    GARDE-FOUS : activable (IMAGE_UPDATE_ENABLED) mais borné à une ALLOWLIST de
//    canaris (IMAGE_UPDATE_CANARY_IDS) et à IMAGE_UPDATE_MAX_PER_PROCESS
//    re-créations par process. On élargit l'allowlist (puis on la vide = parc)
//    une fois le canari vérifié.
//
// Versionné + une fois par routeur et par process (comme le durcissement).

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getAppUrl } from "@/lib/net/app-url";
import type { RouterOSClient } from "./client";

type Sentence = Record<string, string>;

/** À incrémenter à chaque refonte d'HABILLAGE (re-dépose les fichiers UI). */
export const MIKHMON_UI_VERSION = "ui-2";
/** Image conteneur voulue sur tout le parc (tag immuable recommandé). */
export const MIKHMON_DESIRED_IMAGE = "ghcr.io/iamabdoulatif/mikhmon-v7:prix-corrige";

const UI_SYNC_ENABLED = true;

/** Mécanisme 2 activé, mais borné par l'allowlist + le cap ci-dessous. */
const IMAGE_UPDATE_ENABLED = true;
/** CANARI : seuls ces routeurs sont éligibles à la re-création d'image. Vider
 * (`[]`) = tout le parc. COUZA vérifié le 30/10 → ouvert au parc le 31/10.
 * La migration v3 → v7 reste exclue (cf. le garde-fou dans ensureMikhmonImage) :
 * seuls les routeurs DÉJÀ en v7 reçoivent la nouvelle image. */
const IMAGE_UPDATE_CANARY_IDS: string[] = [];
/** Au plus N re-créations par process. `recreatesThisProcess` n'est JAMAIS remis
 * à zéro : c'est un plafond par durée de vie du process, pas par passage du cron.
 * À 1, le parc avançait d'un routeur par déploiement — intenable sur 59. À 5,
 * un process qui tourne quelques heures en fait 5 puis s'arrête de lui-même. */
const IMAGE_UPDATE_MAX_PER_PROCESS = 5;

/** Fichiers d'habillage : servis par l'app, déposés dans le conteneur. */
export const UI_FILES: { url: string; dst: string }[] = [
  { url: "mikhmon-ui/safelink-skin.css", dst: "css/safelink-skin.css" },
  // headhtml.php charge mikhmon-responsive.css : sans ce dépôt, le lien pointe
  // dans le vide sur tout routeur qui ne l'a pas reçu à la main (COUZA l'avait,
  // le reste du parc non — l'interface admin y restait non responsive).
  { url: "mikhmon-ui/mikhmon-responsive.css", dst: "css/mikhmon-responsive.css" },
  { url: "mikhmon-ui/headhtml.txt", dst: "include/headhtml.php" },
  { url: "mikhmon-ui/sessions.txt", dst: "settings/sessions.php" },
];

const done = new Map<string, string>();
let recreatesThisProcess = 0;

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

/**
 * L'habillage est fait POUR MikHmon v7 : son arborescence (`src/src/include`,
 * `src/src/settings`) et ses fichiers PHP n'existent pas en v3.
 *
 * Cas réel (MAMBA-WIFI, 31/10/2026) : conteneur `mikhmonv3-safelinkhub:latest`,
 * root-dir `/mikhmonv3`. `findMikhmonContainer` le reconnaît (« mikhmon » dans
 * le nom), et on y déposait donc des fichiers v7 — ils atterrissaient hors de
 * l'arborescence servie (safelink-skin.css y répond 404). Sans dégât tant que
 * le chemin n'existe pas, mais c'est un coup de dé : écraser un headhtml.php ou
 * un sessions.php v3 par leur version v7 casserait l'interface.
 *
 * On ne dépose donc QUE sur un conteneur dont l'image est de la lignée v7.
 * Image inconnue (remote-image vide) = on s'abstient : ne rien faire est
 * toujours moins grave que remplacer du PHP par celui d'une autre génération.
 *
 * LIGNÉE v7 = deux images, pas une. `ghcr.io/…/mikhmon-v7:prix-corrige` est une
 * COUCHE MINCE sur `latif225/mikhmon-sf-v1` (cf. deploy/mikhmon-v7/Dockerfile,
 * `FROM latif225/mikhmon-sf-v1:latest`) : même génération, même arborescence.
 * Ne reconnaître que « mikhmon-v7 » écartait 14 routeurs du parc — le plus gros
 * groupe après la cible elle-même (inventaire du 31/10/2026).
 *
 * Les vraies v3 (`naufkia/mikhmonv3`, `latif225/mikhmonv3-safelinkhub`) ne
 * contiennent ni « mikhmon-v7 » ni « mikhmon-sf-v1 » : aucun recouvrement.
 */
export function isMikhmonV7Image(remoteImage: string): boolean {
  return /mikhmon-v7|mikhmon-sf-v1/i.test(remoteImage);
}

/** Dépose les fichiers d'habillage dans le conteneur en marche. Sûr (présentation
 * uniquement). Renvoie le nombre de fichiers posés, -1 si pas de conteneur,
 * -2 si le conteneur n'est pas un MikHmon v7 (rien n'est déposé). */
export async function ensureMikhmonUiFiles(client: RouterOSClient, timeoutMs = 20000): Promise<number> {
  const c = await findMikhmonContainer(client, timeoutMs);
  if (!c) return -1;
  if (!isMikhmonV7Image(c.remoteImage)) return -2;
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

/* ═══════════════════════ Mécanisme 2 : mise à jour image ════════════════ */

/** Échappe une chaîne pour un littéral RouterOS entre guillemets doubles.
 * Validé sur COUZA : restaure config.php verbatim via `/file set`. */
export function escapeRosString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

/** Source du script qui réécrit config.php (couche supérieure du container-store). */
export function buildConfigRestoreScript(rootDir: string, configPhp: string): string {
  const path = `${rootDir}/src/src/include/config.php`;
  return `/file set ${path} contents="${escapeRosString(configPhp)}"`;
}

/** Lit config.php via l'API (couche supérieure, modifiée = lisible par chemin). */
async function readConfigPhp(client: RouterOSClient, rootDir: string, timeoutMs = 15000): Promise<string | null> {
  const path = `${rootDir}/src/src/include/config.php`;
  // RouterOS renvoie la valeur d'un `get` dans `=ret=` sur la phrase !done :
  // includeDoneAttributes=true est indispensable pour la capturer.
  const rows = await client
    .talk(["/file/get", `=number=${path}`, "=value-name=contents"], timeoutMs, true)
    .catch(() => null);
  if (!rows) return null;
  for (const r of rows as Sentence[]) {
    const v = r.ret ?? r.value ?? r.contents;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/** Restaure config.php via un script `/file set` échappé (add + run + remove). */
async function restoreConfigPhp(client: RouterOSClient, rootDir: string, configPhp: string, timeoutMs = 20000): Promise<boolean> {
  const name = "slh-cfg-restore";
  const old = await client.talk(["/system/script/print", `?name=${name}`], timeoutMs).catch(() => [] as Sentence[]);
  for (const r of old) if (r[".id"]) await client.talk(["/system/script/remove", `=numbers=${r[".id"]}`], timeoutMs).catch(() => {});
  const ok = await client
    .talk(["/system/script/add", `=name=${name}`, `=source=${buildConfigRestoreScript(rootDir, configPhp)}`], timeoutMs)
    .then(() => true)
    .catch(() => false);
  if (!ok) return false;
  await client.talk(["/system/script/run", `=number=${name}`], timeoutMs).catch(() => {});
  const rows = await client.talk(["/system/script/print", `?name=${name}`], timeoutMs).catch(() => [] as Sentence[]);
  for (const r of rows) if (r[".id"]) await client.talk(["/system/script/remove", `=numbers=${r[".id"]}`], timeoutMs).catch(() => {});
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend que le conteneur soit RÉELLEMENT arrêté (le stop est asynchrone, et
 * `/container remove` refuse « cannot remove running »). */
async function waitStopped(client: RouterOSClient, id: string, maxMs = 30000, pollMs = 3000): Promise<boolean> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    await sleep(pollMs);
    const rows = await client.talk(["/container/print", `?.id=${id}`]).catch(() => [] as Sentence[]);
    if (!rows[0] || rows[0].running !== "true") return true;
  }
  return false;
}

/** Attend que le conteneur tourne, en relançant `start` (inoffensif tant que
 * l'image s'extrait encore). */
async function waitRunning(client: RouterOSClient, maxMs = 180000, pollMs = 10000): Promise<boolean> {
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
 * Re-crée le conteneur MikHmon sur `image`, en préservant la session. Renvoie
 * un statut. Suppose l'allowlist/cap déjà vérifiés par l'appelant.
 */
export async function recreateMikhmonOnImage(
  client: RouterOSClient,
  image: string,
): Promise<"updated" | "failed" | "failed-backup" | "no-container" | "skipped"> {
  const c = await findMikhmonContainer(client);
  if (!c) return "no-container";
  if (c.remoteImage === image) return "skipped";

  // a. sauvegarde verbatim de config.php (sessions + admin).
  // GARDE-FOU CRITIQUE : sans sauvegarde valide, on NE TOUCHE PAS au conteneur —
  // une re-création sans restauration possible perdrait la session. On abandonne
  // proprement (le routeur reste tel quel, zéro perte).
  const configBak = await readConfigPhp(client, c.rootDir);
  if (!configBak || configBak.length <= 50) return "failed-backup";

  // b. stop (attendre l'arrêt réel) + remove.
  await client.talk(["/container/stop", `=numbers=${c.id}`]).catch(() => {});
  await waitStopped(client, c.id);
  const removed = await client.talk(["/container/remove", `=numbers=${c.id}`]).then(() => true).catch(() => false);
  if (!removed) return "failed";

  // c. add sur la nouvelle image (envlist mikhmon = resync natif au boot ;
  //    mêmes interface/root-dir ; start-on-boot).
  const added = await client
    .talk(
      [
        "/container/add",
        `=remote-image=${image}`,
        "=interface=MIKHMON",
        `=root-dir=${c.rootDir}`,
        "=envlist=mikhmon",
        "=start-on-boot=yes",
        "=logging=no",
      ],
    )
    .then(() => true)
    .catch(() => false);
  if (!added) return "failed";
  await waitRunning(client);

  // d. restaure config.php verbatim (sauvegarde garantie valide, cf. garde-fou).
  await restoreConfigPhp(client, c.rootDir, configBak).catch(() => {});
  return "updated";
}

/**
 * Met l'image à jour si elle diffère de l'image voulue — borné par le garde-fou,
 * l'allowlist canari et le cap par process.
 */
export async function ensureMikhmonImage(client: RouterOSClient, routerId: string): Promise<string> {
  if (!IMAGE_UPDATE_ENABLED) return "disabled";
  if (IMAGE_UPDATE_CANARY_IDS.length > 0 && !IMAGE_UPDATE_CANARY_IDS.includes(routerId)) return "not-canary";
  if (recreatesThisProcess >= IMAGE_UPDATE_MAX_PER_PROCESS) return "cap-reached";
  const c = await findMikhmonContainer(client);
  if (!c) return "no-container";
  if (c.remoteImage === MIKHMON_DESIRED_IMAGE) return "already-current";
  // v3 → v7 n'est PAS une mise à jour d'image, c'est une MIGRATION : le root-dir
  // (/mikhmonv3 sur MAMBA-WIFI) est réutilisé tel quel, l'image v7 s'y extrait, et
  // un config.php v3 y est restauré verbatim — rien ne garantit la compatibilité
  // des deux formats. Avec un /container/remove irréversible au milieu, ça ne se
  // fait pas dans un cron en arrière-plan : il faut un opérateur devant.
  if (!isMikhmonV7Image(c.remoteImage)) return "not-v7";
  recreatesThisProcess++;
  const res = await recreateMikhmonOnImage(client, MIKHMON_DESIRED_IMAGE);
  return res;
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
  // 1) Image D'ABORD : si on re-crée le conteneur, il repart sur l'image NUE
  //    (l'habillage n'est pas cuit dedans) — il faut re-déposer les fichiers
  //    ensuite. L'image a son propre garde-fou (allowlist + cap).
  let imageUpdated = false;
  if (IMAGE_UPDATE_ENABLED) {
    const res = await ensureMikhmonImage(client, routerId).catch(() => "error");
    imageUpdated = res === "updated";
  }
  // 2) Habillage : si la version a changé OU si le conteneur vient d'être
  //    re-créé (conteneur neuf sans les fichiers), on (re)dépose.
  const tag = `${MIKHMON_UI_VERSION}`;
  if (UI_SYNC_ENABLED && (done.get(routerId) !== tag || imageUpdated)) {
    await ensureMikhmonUiFiles(client).catch(() => {});
    done.set(routerId, tag);
  }
  // 3) Inventaire : on garde l'état du conteneur au lieu de le jeter. Une
  //    lecture /container/print de plus toutes les 5 min, contre la seule
  //    réponse fiable à « quelle génération tourne sur quel routeur ? ».
  await recordMikhmonInventory(client, routerId);
}
