import type { RouterOSClient } from "./client";

/**
 * MIGRATION MikHmon tmpfs → flash NAND (correctif « MikHmon en RAM »).
 *
 * Sur les boards ax lite/ax² sans stockage persistant, l'auto-setup historique
 * plaçait le conteneur MikHmon sur le tmpfs RAM (root-dir « tmp/… ») : la
 * session est perdue à chaque coupure de courant. Ce correctif déplace le
 * conteneur sur la flash NAND système (persistant) — même logique que le
 * scénario 2 corrigé de l'auto-setup (voir container-setup.ts) et que la
 * migration validée à la main sur HSPT-WIFI / HSPT-ABDOULATIF :
 *   1. config : layer-dir=flash/mikhmon-layers, tmpdir=tmp/pull (extraction RAM)
 *   2. stop + remove du conteneur tmpfs
 *   3. add root-dir=flash/mikhmon-app (mêmes interface / image / nom)
 *   4. start + attente running
 *
 * Long (re-pull de l'image, 1–3 min) → à lancer en arrière-plan (after()).
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MikhmonFlashResult = {
  status: "migrated" | "pulling" | "already-persistent" | "no-container" | "failed";
  message: string;
};

export async function migrateMikhmonToFlash(
  client: RouterOSClient,
  // pollMs : cadence des attentes. Réglable pour que les tests ne paient pas
  // les 25 s d'attentes réelles d'un vrai re-pull.
  opts: { timeoutMs?: number; force?: boolean; pollMs?: number; maxWaitMs?: number } = {},
): Promise<MikhmonFlashResult> {
  const t = opts.timeoutMs ?? 20000;
  const poll = opts.pollMs ?? 6000;
  // Attente bornée : un appel HTTP ne peut pas tenir les 4 min d'un re-pull.
  const rounds = Math.max(1, Math.ceil((opts.maxWaitMs ?? 240000) / poll));

  const conts = await client.talk(["/container/print", "=detail"], t).catch(() => []);
  const mk = conts.find(
    (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
  );
  if (!mk) return { status: "no-container", message: "Aucun conteneur MikHmon sur ce routeur." };

  const rootDir = String(mk["root-dir"] ?? "");
  const persistent = !/^\/?tmp\//.test(rootDir);
  // `force` = réinstallation demandée sur un conteneur cassé (arrêté, veth
  // arrachée) déjà persistant : on refait le stop/remove/add sans exiger
  // qu'il soit en RAM.
  if (persistent && !opts.force) {
    return { status: "already-persistent", message: `Déjà persistant (root-dir=${rootDir}).` };
  }
  // Emplacement cible (voir plus bas) : les couches vont sur le MÊME stockage.
  const targetRootDir = persistent && rootDir ? rootDir : "flash/mikhmon-app";
  const storagePrefix = targetRootDir.replace(/^\/+/, "").split("/")[0];
  const layerDir = `${storagePrefix}/mikhmon-layers`;

  const iface = mk.interface || "MIKHMON";
  const image = mk["remote-image"];
  const name = mk.name;
  if (!image || !name || !mk[".id"]) {
    return { status: "failed", message: "Conteneur MikHmon incomplet (image/nom manquants)." };
  }

  // 1. Config : layers sur la flash (persistant), extraction du pull en RAM.
  await client.talk(
    [
      "/container/config/set",
      "=registry-url=https://registry-1.docker.io",
      // Les couches suivent le conteneur. Les laisser sur la flash pendant que
      // le conteneur vit sur la clé, c'est remplir une flash de 128 Mo avec la
      // plus grosse partie de l'image — le défaut constaté sur HSPT-TOFESSO.
      `=layer-dir=${layerDir}`,
      "=tmpdir=tmp/pull",
    ],
    t,
  );

  // 2. Stop (attendre l'arrêt réel : RouterOS refuse « remove running ») + remove.
  await client.talk(["/container/stop", `=numbers=${mk[".id"]}`], t).catch(() => {});
  let stopped = false;
  for (let i = 0; i < 15; i++) {
    await sleep(Math.min(2000, poll));
    const cur = (await client.talk(["/container/print", "=detail"], t).catch(() => [])).find(
      (c) => c[".id"] === mk[".id"],
    );
    if (!cur) {
      stopped = true;
      break;
    }
    if (cur.running !== "true" && !/running|starting/i.test(String(cur.status ?? ""))) {
      stopped = true;
      break;
    }
  }
  if (!stopped) return { status: "failed", message: "Le conteneur n'a pas pu être arrêté (réessayez)." };

  let removed = false;
  for (let i = 0; i < 8; i++) {
    await sleep(2500);
    const ok = await client
      .talk(["/container/remove", `=numbers=${mk[".id"]}`], t)
      .then(() => true)
      .catch(() => false);
    if (ok) {
      removed = true;
      break;
    }
    const still = (await client.talk(["/container/print", "=detail"], t).catch(() => [])).find(
      (c) => c[".id"] === mk[".id"],
    );
    if (!still) {
      removed = true;
      break;
    }
    await client.talk(["/container/stop", `=numbers=${mk[".id"]}`], t).catch(() => {});
  }
  if (!removed) return { status: "failed", message: "Impossible de retirer l'ancien conteneur (réessayez)." };

  // 3. Re-création (déclenche le re-pull de l'image).
  await client.talk(
    [
      "/container/add",
      `=interface=${iface}`,
      `=name=${name}`,
      `=remote-image=${image}`,
      `=root-dir=${targetRootDir}`,
      "=start-on-boot=yes",
    ],
    60000,
  );
  await sleep(Math.min(2000, poll));
  let nc = (await client.talk(["/container/print", "=detail"], t).catch(() => [])).find((c) =>
    /mikhmon/i.test(String(c.name ?? "")),
  );
  if (nc?.[".id"]) await client.talk(["/container/start", `=numbers=${nc[".id"]}`], t).catch(() => {});

  // 4. Attente running (le pull peut prendre 1–3 min) + relance si extracted/stopped.
  let running = false;
  for (let i = 0; i < rounds; i++) {
    await sleep(poll);
    nc = (await client.talk(["/container/print", "=detail"], t).catch(() => [])).find((c) =>
      /mikhmon/i.test(String(c.name ?? "")),
    );
    if (nc && (nc.running === "true" || nc.status === "running")) {
      running = true;
      break;
    }
    if (nc && /stopped|extracted/i.test(String(nc.status ?? "")) && nc[".id"]) {
      await client.talk(["/container/start", `=numbers=${nc[".id"]}`], t).catch(() => {});
    }
  }

  if (running) {
    return { status: "migrated", message: `MikHmon recréé et démarré (root-dir=${targetRootDir}).` };
  }
  // Pas encore démarré ≠ échoué : le re-pull de l'image prend 1 à 3 min et se
  // poursuit sur le routeur. Le dire, plutôt que d'annoncer une panne.
  return {
    status: "pulling",
    message:
      `Conteneur recréé sur ${targetRootDir}, le routeur télécharge l'image ` +
      "(1 à 3 min). Ré-analysez pour confirmer qu'il tourne.",
  };
}

/**
 * Ce conteneur est-il cassé au point qu'une réinstallation soit justifiée ?
 *
 * Deux signes, et deux seulement :
 *  • RouterOS annonce lui-même un échec de téléchargement/extraction — c'est
 *    l'état « rebooted during download/extract, need repull », qui ne se
 *    résout jamais tout seul ;
 *  • les COUCHES sont sur un autre stockage que le conteneur. Sur un L009
 *    (128 Mo de flash) dont le conteneur vit sur la clé, extraire les couches
 *    sur la flash ne peut qu'échouer, indéfiniment.
 *
 * Un conteneur qui TOURNE n'est jamais touché, et un conteneur arrêté dont le
 * stockage est cohérent non plus : l'exploitant a pu l'arrêter exprès.
 */
export function isBrokenMikhmonContainer(
  row: Record<string, string>,
  configLayerDir: string | undefined,
): boolean {
  const status = String(row.status ?? "").toLowerCase();
  if (row.running === "true" || status === "running") return false;
  if (/repull|error|fail/.test(status)) return true;

  const storageOf = (p: string) => String(p ?? "").replace(/^\/+/, "").split("/")[0];
  const rootStorage = storageOf(row["root-dir"] ?? "");
  const layerStorage = storageOf(configLayerDir ?? "");
  return Boolean(rootStorage && layerStorage && rootStorage !== layerStorage);
}

/**
 * Répare un conteneur MikHmon cassé, sans intervention humaine.
 *
 * Appelé par la synchronisation périodique : une réinstallation ne devrait pas
 * exiger qu'un exploitant tombe sur le bon bouton. On ne PATIENTE pas jusqu'au
 * bout du téléchargement (1 à 3 min) — la recréation suffit, RouterOS poursuit
 * le pull seul et le balayage suivant constatera.
 */
export async function repairBrokenMikhmonContainer(
  client: RouterOSClient,
  log?: string[],
): Promise<{ repaired: boolean; reason: string }> {
  const conts = await client.talk(["/container/print", "=detail"], 20000).catch(() => []);
  const mk = conts.find(
    (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
  );
  if (!mk) return { repaired: false, reason: "aucun conteneur MikHmon" };

  const config = (await client.talk(["/container/config/print"], 20000).catch(() => []))[0] ?? {};
  if (!isBrokenMikhmonContainer(mk, config["layer-dir"])) {
    return { repaired: false, reason: "conteneur sain" };
  }

  const result = await migrateMikhmonToFlash(client, { force: true, maxWaitMs: 15000 });
  log?.push(`AUTO-RÉPARATION MikHmon : ${result.status} — ${result.message}`);
  return {
    repaired: result.status === "migrated" || result.status === "pulling",
    reason: result.message,
  };
}
