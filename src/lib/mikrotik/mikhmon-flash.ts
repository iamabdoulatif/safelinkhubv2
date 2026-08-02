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
  status: "migrated" | "already-persistent" | "no-container" | "failed";
  message: string;
};

export async function migrateMikhmonToFlash(
  client: RouterOSClient,
  opts: { timeoutMs?: number } = {},
): Promise<MikhmonFlashResult> {
  const t = opts.timeoutMs ?? 20000;

  const conts = await client.talk(["/container/print", "=detail"], t).catch(() => []);
  const mk = conts.find(
    (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
  );
  if (!mk) return { status: "no-container", message: "Aucun conteneur MikHmon sur ce routeur." };

  const rootDir = String(mk["root-dir"] ?? "");
  if (!/^\/?tmp\//.test(rootDir)) {
    return { status: "already-persistent", message: `Déjà persistant (root-dir=${rootDir}).` };
  }
  const iface = mk.interface || "MIKHMON";
  const image = mk["remote-image"];
  const name = mk.name;
  if (!image || !name || !mk[".id"]) {
    return { status: "failed", message: "Conteneur MikHmon incomplet (image/nom manquants)." };
  }

  // 1. Config : layers sur la flash (persistant), extraction du pull en RAM.
  await client.talk(
    ["/container/config/set", "=registry-url=https://registry-1.docker.io", "=layer-dir=flash/mikhmon-layers", "=tmpdir=tmp/pull"],
    t,
  );

  // 2. Stop (attendre l'arrêt réel : RouterOS refuse « remove running ») + remove.
  await client.talk(["/container/stop", `=numbers=${mk[".id"]}`], t).catch(() => {});
  let stopped = false;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
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

  // 3. Re-création sur la flash (déclenche le re-pull de l'image).
  await client.talk(
    [
      "/container/add",
      `=interface=${iface}`,
      `=name=${name}`,
      `=remote-image=${image}`,
      "=root-dir=flash/mikhmon-app",
      "=start-on-boot=yes",
    ],
    60000,
  );
  await sleep(2000);
  let nc = (await client.talk(["/container/print", "=detail"], t).catch(() => [])).find((c) =>
    /mikhmon/i.test(String(c.name ?? "")),
  );
  if (nc?.[".id"]) await client.talk(["/container/start", `=numbers=${nc[".id"]}`], t).catch(() => {});

  // 4. Attente running (le pull peut prendre 1–3 min) + relance si extracted/stopped.
  let running = false;
  for (let i = 0; i < 40; i++) {
    await sleep(6000);
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

  return running
    ? {
        status: "migrated",
        message:
          "MikHmon déplacé sur la flash (persistant). La session est à recréer une dernière fois, puis elle survivra aux reboots.",
      }
    : {
        status: "failed",
        message: "Conteneur recréé sur la flash mais pas encore démarré — vérifiez dans ~1 min (pull long ou flash pleine).",
      };
}
