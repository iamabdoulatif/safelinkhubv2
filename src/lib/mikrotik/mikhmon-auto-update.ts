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
//        planificateurs d'expiration, NI les profils hotspot (tout ça vit sur le
//        ROUTEUR, pas dans le conteneur). Rien à re-synchroniser, zéro perte.
//    Activé par défaut ; versionné par MIKHMON_UI_VERSION.
//
// 2. MISE À JOUR DE L'IMAGE (ensureMikhmonImage) — pour une REFONTE TOTALE
//    (nouvelle image conteneur). Re-crée le conteneur sur l'image voulue. La
//    re-création ré-extrait l'image → config.php (sessions) revient au modèle,
//    DONC on :
//      a. SAUVEGARDE config.php verbatim (lecture API) avant,
//      b. (re)pose l'envlist « mikhmon » depuis la base (l'image régénère la
//         session au démarrage — resync natif, cf. container-setup.ts),
//      c. re-crée le conteneur sur la nouvelle image,
//      d. RESTAURE config.php verbatim (écrasement) → sessions + mot de passe
//         admin + sessions multiples préservés à l'identique.
//    Les ventes / expirations / profils vivent sur le routeur → intacts.
//    GARDE-FOU : désactivé par défaut (MIKHMON_IMAGE_UPDATE_ENABLED=false) tant
//    que la re-création n'a pas été validée sur cobaye — une re-création ratée à
//    l'échelle du parc casse MikHmon partout. À activer après validation.
//
// Versionné + une fois par routeur et par process (comme le durcissement).

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getAppUrl } from "@/lib/net/app-url";
import type { RouterOSClient } from "./client";

type Sentence = Record<string, string>;

/** À incrémenter à chaque refonte d'HABILLAGE (re-dépose les fichiers UI). */
export const MIKHMON_UI_VERSION = "ui-1";
/** À incrémenter à chaque refonte TOTALE d'image (déclenche la re-création). */
export const MIKHMON_IMAGE_VERSION = "img-1";
/** Image conteneur voulue sur tout le parc (tag immuable recommandé). */
export const MIKHMON_DESIRED_IMAGE = "ghcr.io/iamabdoulatif/mikhmon-v7:prix-corrige";

const UI_SYNC_ENABLED = true;
/** Re-création d'image : OFF tant que non validée sur cobaye (fleet-dangereux). */
const IMAGE_UPDATE_ENABLED = false;

/** Fichiers d'habillage : servis par l'app, déposés dans le conteneur. La clé
 * `url` est relative à getAppUrl() ; `dst` est relatif à <root-dir>/src/src. */
const UI_FILES: { url: string; dst: string }[] = [
  { url: "mikhmon-ui/safelink-skin.css", dst: "css/safelink-skin.css" },
  { url: "mikhmon-ui/headhtml.txt", dst: "include/headhtml.php" },
  { url: "mikhmon-ui/sessions.txt", dst: "settings/sessions.php" },
];

const done = new Map<string, string>();

type Container = { id: string; rootDir: string; remoteImage: string; running: boolean };

/** Conteneur MikHmon du routeur (par nom/root-dir), ou null. root-dir sans « / »
 * de tête, prêt à être concaténé pour les chemins /file. */
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
    running: mk.running === "true" || mk.running === "yes",
  };
}

/**
 * Mécanisme 1 : dépose les fichiers d'habillage dans le conteneur en marche.
 * Idempotent, sûr (ne touche que des fichiers de présentation). Renvoie le
 * nombre de fichiers posés, ou -1 si aucun conteneur MikHmon.
 */
export async function ensureMikhmonUiFiles(client: RouterOSClient, timeoutMs = 20000): Promise<number> {
  const c = await findMikhmonContainer(client, timeoutMs);
  if (!c) return -1;
  const base = getAppUrl().replace(/\/+$/, "");
  let ok = 0;
  for (const f of UI_FILES) {
    const url = `${base}/${f.url}`;
    const dst = `${c.rootDir}/src/src/${f.dst}`;
    const r = await client
      .talk(["/tool/fetch", `=url=${url}`, `=dst-path=${dst}`, "=keep-result=no"], timeoutMs)
      .then(() => true)
      .catch(() => false);
    if (r) ok++;
  }
  return ok;
}

/** Lit un fichier du conteneur (couche supérieure) via l'API. null si absent. */
async function readContainerFile(client: RouterOSClient, rootDir: string, rel: string, timeoutMs = 15000): Promise<string | null> {
  const path = `${rootDir}/src/src/${rel}`;
  const rows = await client.talk(["/file/get", `=number=${path}`, "=value-name=contents"], timeoutMs).catch(() => null);
  if (!rows || !rows[0]) return null;
  const v = rows[0].ret ?? rows[0].value ?? rows[0].contents;
  return typeof v === "string" ? v : null;
}

/** Écrit un fichier du conteneur (couche supérieure) via l'API — crée si besoin. */
async function writeContainerFile(client: RouterOSClient, rootDir: string, rel: string, contents: string, timeoutMs = 20000): Promise<boolean> {
  const path = `${rootDir}/src/src/${rel}`;
  // /file/set par chemin écrit la couche supérieure (crée le fichier au besoin).
  return client
    .talk(["/file/set", `=numbers=${path}`, `=contents=${contents}`], timeoutMs)
    .then(() => true)
    .catch(() => false);
}

/** Données de session MikHmon tirées de la base, pour (re)poser l'envlist. */
async function loadMikhmonSessionEnv(routerId: string): Promise<Record<string, string> | null> {
  const db = getDb();
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return null;
  const name = r.hotspotServerName || r.name || "SafeLinkHub";
  return {
    MIKHMON_SESSION: name,
    MIKHMON_HOTSPOT_NAME: r.name || name,
    // MT_IP = passerelle veth ; user/pass gérés par container-setup à l'install.
  };
}

/**
 * Mécanisme 2 : met l'image du conteneur à jour (refonte totale), en préservant
 * la session. GARDE-FOU : no-op tant que IMAGE_UPDATE_ENABLED est false.
 *
 * Étapes sûres : sauvegarde config.php → re-création sur l'image voulue →
 * restauration config.php. (La re-création elle-même réutilise le flux éprouvé
 * de container-setup ; branché ici seulement après validation cobaye.)
 */
export async function ensureMikhmonImage(
  client: RouterOSClient,
  routerId: string,
  recreate: (client: RouterOSClient, image: string) => Promise<boolean>,
  timeoutMs = 45000,
): Promise<"skipped" | "updated" | "failed" | "no-container"> {
  if (!IMAGE_UPDATE_ENABLED) return "skipped";
  const c = await findMikhmonContainer(client, timeoutMs);
  if (!c) return "no-container";
  if (c.remoteImage === MIKHMON_DESIRED_IMAGE) return "skipped";

  // a. sauvegarde verbatim de config.php (sessions + admin).
  const configBak = await readContainerFile(client, c.rootDir, "include/config.php", timeoutMs);
  // b. envlist depuis la base (resync natif au démarrage de l'image).
  await loadMikhmonSessionEnv(routerId).catch(() => null);
  // c. re-création sur la nouvelle image (flux fourni par l'appelant).
  const ok = await recreate(client, MIKHMON_DESIRED_IMAGE).catch(() => false);
  if (!ok) return "failed";
  // d. restauration verbatim de config.php (écrase le modèle ré-extrait).
  if (configBak && configBak.length > 50) {
    await writeContainerFile(client, c.rootDir, "include/config.php", configBak, timeoutMs).catch(() => {});
  }
  return "updated";
}

/**
 * Orchestrateur appelé à la synchro : au plus une fois par routeur et par
 * process, versionné. Pose l'habillage (toujours), et — si activé — met l'image
 * à jour quand elle diffère de l'image voulue.
 */
export async function reconcileMikhmonAutoUpdate(
  client: RouterOSClient,
  routerId: string,
  recreate?: (client: RouterOSClient, image: string) => Promise<boolean>,
): Promise<void> {
  const tag = `${MIKHMON_UI_VERSION}|${IMAGE_UPDATE_ENABLED ? MIKHMON_IMAGE_VERSION : "img-off"}`;
  if (done.get(routerId) === tag) return;
  if (UI_SYNC_ENABLED) {
    await ensureMikhmonUiFiles(client).catch(() => {});
  }
  if (IMAGE_UPDATE_ENABLED && recreate) {
    await ensureMikhmonImage(client, routerId, recreate).catch(() => {});
  }
  done.set(routerId, tag);
}
