process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMikhmonContainer,
  ensureMikhmonUiFiles,
  ensureMikhmonImage,
  resetImageUpdateStateForTests,
  ensureMikhmonCodeFiles,
  ensureMikhmonPriceFix,
  MIKHMON_DESIRED_IMAGE,
} from "./mikhmon-auto-update";
import type { RouterOSClient } from "./client";

const COUZA = "92eb5519-52b3-49cd-aace-6f5dd7ca2e76"; // routeur canari (allowlist)

function fakeClient(calls: string[][], row?: Record<string, string> | null): RouterOSClient {
  const container =
    row === null
      ? null
      : row ?? {
          ".id": "*1",
          name: "mikhmon-sf-v1:latest",
          "root-dir": "/usb1/mikhmon-app",
          "remote-image": MIKHMON_DESIRED_IMAGE,
          running: "true",
        };
  return {
    talk: async (cmd: string[]) => {
      calls.push(cmd);
      if (cmd[0] === "/container/print") return container ? [container] : [];
      return [];
    },
  } as unknown as RouterOSClient;
}

test("findMikhmonContainer : root-dir sans slash de tête", async () => {
  const c = await findMikhmonContainer(fakeClient([]));
  assert.equal(c?.rootDir, "usb1/mikhmon-app");
  assert.equal(c?.running, true);
});

test("ensureMikhmonUiFiles : écrase headhtml+sessions, PAS de css neuf", async () => {
  const calls: string[][] = [];
  const n = await ensureMikhmonUiFiles(fakeClient(calls));
  // Deux ÉCRASEMENTS (servis à chaud). La skin est INLINE dans headhtml.php :
  // on ne dépose plus de fichier css/safelink-skin.css NEUF (qui resterait 404
  // tant que le conteneur n'a pas redémarré).
  assert.equal(n, 2);
  const head = calls.find((c) => c[0] === "/tool/fetch" && c.some((w) => w.includes("headhtml")));
  assert.ok(head!.includes("=url=https://safelinkhub.io/mikhmon-ui/headhtml.txt"));
  assert.ok(head!.includes("=dst-path=usb1/mikhmon-app/src/src/include/headhtml.php"));
  assert.equal(
    calls.some((c) => c.some((w) => w.includes("safelink-skin.css"))),
    false,
    "ne dépose plus css/safelink-skin.css",
  );
});

const V3 = "latif225/mikhmonv3-safelinkhub:latest";
const SF = "latif225/mikhmon-sf-v1:latest";
const row = (img: string) => ({ ".id": "*1", name: "mikhmon", "root-dir": "/flash/mikhmon-app", "remote-image": img, running: "true" });
type Migrate = NonNullable<NonNullable<Parameters<typeof ensureMikhmonImage>[2]>["migrate"]>;
const ok: Migrate = async () => ({ status: "migrated", message: "ok" });
const ko: Migrate = async () => ({ status: "failed", message: "add refusé" });

test.skip("ensureMikhmonImage : édition v3 = not-eligible, jamais recréée", async () => {
  resetImageUpdateStateForTests();
  let called = false;
  const spy: Migrate = async () => ((called = true), { status: "migrated", message: "" });
  assert.equal(await ensureMikhmonImage(fakeClient([], row(V3)), "r1", { migrate: spy }), "not-eligible");
  assert.equal(called, false);
});

test.skip("ensureMikhmonImage : déjà sur l'image voulue = already-current", async () => {
  resetImageUpdateStateForTests();
  assert.equal(await ensureMikhmonImage(fakeClient([]), COUZA, { migrate: ok }), "already-current");
});

test.skip("ensureMikhmonImage : sf-v1 recréé sur l'image voulue via migrateMikhmonToFlash(force, image)", async () => {
  resetImageUpdateStateForTests();
  let got: Parameters<Migrate>[1] | undefined;
  const spy: Migrate = async (_c, o) => ((got = o), { status: "pulling", message: "" });
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r1", { migrate: spy }), "updated");
  assert.equal(got?.force, true);
  assert.equal(got?.image, MIKHMON_DESIRED_IMAGE);
});

test.skip("ensureMikhmonImage : 3 re-créations par fenêtre de 10 min, puis cap-reached", async () => {
  resetImageUpdateStateForTests();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), `r${i}`, { now: t0, migrate: ok }), "updated");
  }
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r4", { now: t0 + 60_000, migrate: ok }), "cap-reached");
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r4", { now: t0 + 11 * 60_000, migrate: ok }), "updated");
});

test.skip("ensureMikhmonImage : un échec ouvre le coupe-circuit pour tout le parc", async () => {
  resetImageUpdateStateForTests();
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r1", { migrate: ko }), "failed");
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r2", { migrate: ok }), "circuit-open");
});

test("ensureMikhmonCodeFiles : 3 fichiers du rapport déposés (keep-result par défaut) puis redémarrage, famille sf-v1", async () => {
  const calls: string[][] = [];
  let restarted = 0;
  const n = await ensureMikhmonCodeFiles(fakeClient(calls, row(SF)), { restart: async () => ((restarted++), true) });
  assert.equal(n, 3);
  assert.equal(restarted, 1);
  const fetches = calls.filter((c) => c[0] === "/tool/fetch");
  assert.equal(fetches.length, 3);
  assert.ok(fetches.every((c) => !c.includes("=keep-result=no")), "keep-result=no n'écrit pas le fichier");
  assert.ok(fetches.some((c) => c.includes("=dst-path=flash/mikhmon-app/src/src/report/selling.php")));
  assert.ok(fetches.some((c) => c.includes("=url=https://safelinkhub.io/mikhmon-code/mikhmon_compat.txt")));
});

test("ensureMikhmonCodeFiles : édition v3 non touchée (0, aucun fetch, aucun redémarrage)", async () => {
  const calls: string[][] = [];
  let restarted = 0;
  assert.equal(await ensureMikhmonCodeFiles(fakeClient(calls, row(V3)), { restart: async () => ((restarted++), true) }), 0);
  assert.equal(calls.filter((c) => c[0] === "/tool/fetch").length, 0);
  assert.equal(restarted, 0);
});

test("ensureMikhmonCodeFiles : un fetch en échec = pas de redémarrage (version non posée)", async () => {
  let restarted = 0;
  let k = 0;
  const client = {
    talk: async (cmd: string[]) => {
      if (cmd[0] === "/container/print") return [row(SF)];
      if (cmd[0] === "/tool/fetch" && ++k === 2) throw new Error("timeout");
      return [];
    },
  } as unknown as RouterOSClient;
  assert.equal(await ensureMikhmonCodeFiles(client, { restart: async () => ((restarted++), true) }), 2);
  assert.equal(restarted, 0);
});

function priceClient(image: string, sizes: Record<string, string>) {
  const calls: string[][] = [];
  const client = {
    talk: async (cmd: string[]) => {
      calls.push(cmd);
      if (cmd[0] === "/container/print") return [row(image)];
      if (cmd[0] === "/file/print") {
        const name = cmd.find((w) => w.startsWith("?name="))!.slice(6);
        const f = Object.keys(sizes).find((k) => name.endsWith(`/voucher/${k}`));
        return f ? [{ name, size: sizes[f] }] : [];
      }
      return [];
    },
  } as unknown as RouterOSClient;
  return { client, calls };
}

test("ensureMikhmonPriceFix : Docker Hub, modèles d'origine corrigés, couleurs-prix déposé en premier", async () => {
  const r = priceClient(SF, { "template.php": "8894", "template-small.php": "8133", "safetmp.php": "8838" });
  assert.equal(await ensureMikhmonPriceFix(r.client), 3);
  const fetches = r.calls.filter((c) => c[0] === "/tool/fetch");
  assert.equal(fetches.length, 4);
  assert.ok(fetches[0].some((w) => w.endsWith("/voucher/couleurs-prix.php")), "couleurs-prix.php doit passer en premier");
});

test("ensureMikhmonPriceFix : modèle personnalisé (autre taille) laissé intact", async () => {
  const r = priceClient(SF, { "template.php": "12001", "template-small.php": "8133", "safetmp.php": "9000" });
  assert.equal(await ensureMikhmonPriceFix(r.client), 1);
  const dsts = r.calls.filter((c) => c[0] === "/tool/fetch").map((c) => c.find((w) => w.startsWith("=dst-path="))!);
  assert.ok(!dsts.some((d) => d.endsWith("/voucher/template.php")), "template.php personnalisé écrasé");
  assert.ok(!dsts.some((d) => d.endsWith("/voucher/safetmp.php")), "safetmp.php personnalisé écrasé");
});

test("ensureMikhmonPriceFix : prix-corrige / ui-* / v3 non concernés", async () => {
  for (const img of ["ghcr.io/iamabdoulatif/mikhmon-v7:prix-corrige", MIKHMON_DESIRED_IMAGE, V3]) {
    const r = priceClient(img, { "template.php": "8894" });
    assert.equal(await ensureMikhmonPriceFix(r.client), 0);
    assert.equal(r.calls.filter((c) => c[0] === "/tool/fetch").length, 0);
  }
});
