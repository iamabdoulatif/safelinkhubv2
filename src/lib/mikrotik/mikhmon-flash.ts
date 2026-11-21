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

/** Image de repli sur Docker Hub (même code sf-v1, filtres période + vendeur) pour
 * les routeurs qui n'atteignent pas ghcr.io (« Network unreachable », « timeout
 * connecting » relevés le 21/11/2026 sur PHARAON et DIAK). */
export const MIKHMON_DOCKERHUB_IMAGE = "latif225/mikhmon-sf-v1:latest";

/** Dossier de téléchargement : sur la clé quand le conteneur y vit (/tmp en RAM
 * est trop petit pour une couche : « not enough disk space to download layer »,
 * HSPT-DOUCOURE), sinon /tmp. */
export function pullTmpDir(rootDir: string): string {
  const prefix = rootDir.replace(/^\/+/, "").split("/")[0] ?? "";
  return rootDir.includes("/") && /^(usb|disk|sata|nvme|sd)/i.test(prefix) ? `${prefix}/mikhmon-pull` : "tmp/pull";
}

export type MikhmonFlashResult = {
  status: "migrated" | "pulling" | "already-persistent" | "no-container" | "failed";
  message: string;
};

export async function migrateMikhmonToFlash(
  client: RouterOSClient,
  // pollMs : cadence des attentes. Réglable pour que les tests ne paient pas
  // les 25 s d'attentes réelles d'un vrai re-pull.
  // image : recrée sur cette image plutôt que sur celle du conteneur actuel
  // (mise à jour d'image du parc, cf. mikhmon-auto-update.ts).
  opts: { timeoutMs?: number; force?: boolean; pollMs?: number; maxWaitMs?: number; image?: string } = {},
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
  const rootParts = targetRootDir.replace(/^\/+/, "").split("/");
  // Sans préfixe de stockage (root-dir « mikhmon-app »), « <préfixe>/mikhmon-layers »
  // tombait DANS le root-dir : RouterOS refuse alors tout add (« layer-dir overlap
  // with root-dir », HSPT-DUBONHEUR le 21/11/2026). Dans ce cas on ne touche pas
  // au layer-dir du routeur.
  const layerDir = rootParts.length > 1 ? `${rootParts[0]}/mikhmon-layers` : null;

  const iface = mk.interface || "MIKHMON";
  const oldImage = mk["remote-image"];
  const oldName = mk.name;
  if (!oldImage || !oldName || !mk[".id"]) {
    return { status: "failed", message: "Conteneur MikHmon incomplet (image/nom manquants)." };
  }
  const image = opts.image ?? oldImage;
  const name = opts.image ? (opts.image.split("/").pop() ?? oldName) : oldName;

  // 1. Config : layers sur la flash (persistant), extraction du pull en RAM.
  await client.talk(
    [
      "/container/config/set",
      "=registry-url=https://registry-1.docker.io",
      // Les couches suivent le conteneur. Les laisser sur la flash pendant que
      // le conteneur vit sur la clé, c'est remplir une flash de 128 Mo avec la
      // plus grosse partie de l'image — le défaut constaté sur HSPT-TOFESSO.
      ...(layerDir ? [`=layer-dir=${layerDir}`] : []),
      `=tmpdir=${pullTmpDir(targetRootDir)}`,
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
  const add = (img: string, nm: string) =>
    client.talk(
      [
        "/container/add",
        `=interface=${iface}`,
        `=name=${nm}`,
        `=remote-image=${img}`,
        `=root-dir=${targetRootDir}`,
        "=start-on-boot=yes",
      ],
      60000,
    );
  const addError = await add(image, name).then(() => null, (e: unknown) => e);
  if (addError) {
    // Le RouterOS a pu créer l'entrée malgré l'erreur (réponse perdue) : on ne
    // ré-ajoute l'ancienne image que si aucun conteneur MikHmon n'existe.
    // Sans ce repli, le routeur restait SANS MikHmon (GUEASSO-HSPT, 21/11/2026).
    const after = await client.talk(["/container/print", "=detail"], t).catch(() => []);
    const any = after.find((c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")));
    if (!any) {
      const back = await add(oldImage, oldName).then(() => true, () => false);
      if (back) {
        await sleep(Math.min(2000, poll));
        const re = (await client.talk(["/container/print", "=detail"], t).catch(() => [])).find((c) =>
          /mikhmon/i.test(String(c.name ?? "")),
        );
        if (re?.[".id"]) await client.talk(["/container/start", `=numbers=${re[".id"]}`], t).catch(() => {});
      }
      const msg = addError instanceof Error ? addError.message : String(addError);
      return {
        status: "failed",
        message: back
          ? `Ajout sur ${image} refusé (${msg}) : ancienne image ${oldImage} remise en place.`
          : `Ajout sur ${image} refusé (${msg}), et l'ancienne image n'a pas pu être remise.`,
      };
    }
  }
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
  // RouterOS récents : plus de « status », un indicateur dédié à l'échec.
  if (row["download/extract failed"] === "true") return true;

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
    // A forward MikhHmon actif is an explicit contract that the managed
    // container must serve traffic.  RouterOS can leave a coherent container
    // stopped after a reboot, a failed manual restart, or an operator action;
    // treating that state as "healthy" produced the exact symptom seen in
    // production: the VPN/API was reachable while the public web forward was
    // silently empty.  Start it idempotently and persist the intent across the
    // next reboot.  Corrupt states still take the reinstall path below.
    const running = mk.running === "true" || String(mk.status ?? "").toLowerCase() === "running";
    if (running) return { repaired: false, reason: "conteneur sain" };

    if (!mk[".id"]) return { repaired: false, reason: "conteneur arrêté sans identifiant" };

    await client
      .talk(["/container/set", `=numbers=${mk[".id"]}`, "=start-on-boot=yes"], 20000)
      .catch(() => {});
    await client.talk(["/container/start", `=numbers=${mk[".id"]}`], 20000);
    log?.push("AUTO-DÉMARRAGE MikHmon : conteneur arrêté relancé (start-on-boot=yes)");
    return { repaired: true, reason: "conteneur arrêté relancé" };
  }

  // Échec de téléchargement depuis ghcr.io : le routeur n'atteint pas ce
  // registre, re-tirer la même image échouerait encore. On repart de Docker Hub.
  const ghcrFailed = mk["download/extract failed"] === "true" && /^ghcr\.io\//.test(String(mk["remote-image"] ?? ""));
  const result = await migrateMikhmonToFlash(client, {
    force: true,
    maxWaitMs: 15000,
    timeoutMs: 45000,
    ...(ghcrFailed ? { image: MIKHMON_DOCKERHUB_IMAGE } : {}),
  });
  log?.push(`AUTO-RÉPARATION MikHmon : ${result.status} — ${result.message}`);
  return {
    repaired: result.status === "migrated" || result.status === "pulling",
    reason: result.message,
  };
}

/**
 * Recrée un conteneur MikHmon DISPARU (remove réussi, add refusé), sans rejouer
 * toute l'installation : même interface veth (MIKHMON) et même stockage. Le
 * root-dir est celui de l'ancien conteneur quand on le connaît ; sinon on
 * reprend le dossier MikHmon resté sur le routeur, à défaut l'emplacement
 * standard (flash/mikhmon-app, ou mikhmon-app sur les cartes sans /flash).
 */
export async function readdMikhmonContainer(
  client: RouterOSClient,
  opts: { image: string; rootDir?: string; iface?: string; timeoutMs?: number; pollMs?: number; maxWaitMs?: number },
): Promise<MikhmonFlashResult> {
  const t = opts.timeoutMs ?? 20000;
  const poll = opts.pollMs ?? 6000;
  const rounds = Math.max(1, Math.ceil((opts.maxWaitMs ?? 180000) / poll));
  const isMk = (c: Record<string, string>) =>
    /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? ""));
  if ((await client.talk(["/container/print", "=detail"], t).catch(() => [])).some(isMk)) {
    return { status: "failed", message: "Un conteneur MikHmon existe déjà." };
  }

  let rootDir = (opts.rootDir ?? "").replace(/^\/+/, "");
  if (!rootDir) {
    const dirs = (await client.talk(["/file/print", "?type=directory"], t).catch(() => []))
      .map((f) => String(f.name ?? "").replace(/^\/+/, ""));
    rootDir =
      dirs.find((d) => /^([^/]+\/)?mikhmon-app$/.test(d)) ??
      dirs.find((d) => /^([^/]+\/)?mikhmon[^/]*$/i.test(d) && !/layers|pull|tmp/i.test(d)) ??
      (dirs.includes("flash") ? "flash/mikhmon-app" : "mikhmon-app");
  }
  const parts = rootDir.split("/");
  await client
    .talk(
      [
        "/container/config/set",
        "=registry-url=https://registry-1.docker.io",
        ...(parts.length > 1 ? [`=layer-dir=${parts[0]}/mikhmon-layers`] : []),
        `=tmpdir=${pullTmpDir(rootDir)}`,
      ],
      t,
    )
    .catch(() => {});

  const name = opts.image.split("/").pop() ?? "mikhmon";
  await client.talk(
    [
      "/container/add",
      `=interface=${opts.iface ?? "MIKHMON"}`,
      `=name=${name}`,
      `=remote-image=${opts.image}`,
      `=root-dir=${rootDir}`,
      "=start-on-boot=yes",
    ],
    60000,
  );
  for (let i = 0; i < rounds; i++) {
    await sleep(poll);
    const nc = (await client.talk(["/container/print", "=detail"], t).catch(() => [])).find(isMk);
    if (nc && (nc.running === "true" || nc.status === "running")) {
      return { status: "migrated", message: `MikHmon recréé et démarré (root-dir=${rootDir}).` };
    }
    if (nc?.[".id"]) await client.talk(["/container/start", `=numbers=${nc[".id"]}`], t).catch(() => {});
  }
  return { status: "pulling", message: `Conteneur recréé sur ${rootDir}, téléchargement de l'image en cours.` };
}
