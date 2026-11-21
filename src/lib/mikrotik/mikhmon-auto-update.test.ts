process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMikhmonContainer,
  ensureMikhmonUiFiles,
  ensureMikhmonImage,
  isMikhmonV7Image,
  resetImageUpdateStateForTests,
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
  // Deux ÉCRASEMENTS seulement. La skin est INLINE dans headhtml.php, et
  // mikhmon-responsive.css voyage par l'IMAGE (:ui-2) : le dépôt à chaud s'est
  // révélé non fiable, l'overlay continuant de servir le fichier de l'image.
  assert.equal(n, 2);
  const head = calls.find((c) => c[0] === "/tool/fetch" && c.some((w) => w.includes("headhtml")));
  assert.ok(head!.includes("=url=https://safelinkhub.io/mikhmon-ui/headhtml.txt"));
  assert.ok(head!.includes("=dst-path=usb1/mikhmon-app/src/src/include/headhtml.php"));
  for (const css of ["safelink-skin.css", "mikhmon-responsive.css"]) {
    assert.equal(
      calls.some((c) => c.some((w) => w.includes(css))),
      false,
      `ne dépose plus css/${css}`,
    );
  }
});

test("ensureMikhmonUiFiles : un conteneur MikHmon v3 ne reçoit RIEN", async () => {
  // Conteneur réel de MAMBA-WIFI (/container/print detail, 31/10/2026).
  // Son nom contient « mikhmon » donc findMikhmonContainer le trouve, mais
  // l'habillage est fait pour la v7 : y déposer des PHP v7 casserait l'UI.
  const calls: string[][] = [];
  const n = await ensureMikhmonUiFiles(
    fakeClient(calls, {
      ".id": "*1",
      name: "mikhmonv3-safelinkhub:latest",
      "root-dir": "/mikhmonv3",
      "remote-image": "latif225/mikhmonv3-safelinkhub:latest",
      running: "true",
    }),
  );
  assert.equal(n, -2);
  assert.equal(calls.filter((c) => c[0] === "/tool/fetch").length, 0);
});

// Les cinq images réellement présentes sur le parc (inventaire du 31/10/2026).
test("isMikhmonV7Image : la lignée v7 couvre aussi l'image de base sf-v1", () => {
  // mikhmon-v7:prix-corrige est une COUCHE MINCE sur mikhmon-sf-v1 :
  // même génération, même arborescence (deploy/mikhmon-v7/Dockerfile).
  assert.equal(isMikhmonV7Image(MIKHMON_DESIRED_IMAGE), true);
  assert.equal(isMikhmonV7Image("ghcr.io/iamabdoulatif/mikhmon-v7:ui-cobaye"), true);
  assert.equal(isMikhmonV7Image("latif225/mikhmon-sf-v1:latest"), true);
  // Vraies v3 : aucun recouvrement avec les motifs ci-dessus.
  assert.equal(isMikhmonV7Image("latif225/mikhmonv3-safelinkhub:latest"), false);
  assert.equal(isMikhmonV7Image("naufkia/mikhmonv3:latest"), false);
  // Image non relevée : abstention.
  assert.equal(isMikhmonV7Image(""), false);
});

const V3 = "latif225/mikhmonv3-safelinkhub:latest";
const SF = "latif225/mikhmon-sf-v1:latest";
const row = (img: string) => ({ ".id": "*1", name: "mikhmon", "root-dir": "/flash/mikhmon-app", "remote-image": img, running: "true" });
type Migrate = NonNullable<NonNullable<Parameters<typeof ensureMikhmonImage>[2]>["migrate"]>;
const ok: Migrate = async () => ({ status: "migrated", message: "ok" });
const ko: Migrate = async () => ({ status: "failed", message: "add refusé" });

test("ensureMikhmonImage : édition v3 = not-eligible, jamais recréée", async () => {
  resetImageUpdateStateForTests();
  let called = false;
  const spy: Migrate = async () => ((called = true), { status: "migrated", message: "" });
  assert.equal(await ensureMikhmonImage(fakeClient([], row(V3)), "r1", { migrate: spy }), "not-eligible");
  assert.equal(called, false);
});

test("ensureMikhmonImage : déjà sur l'image voulue = already-current", async () => {
  resetImageUpdateStateForTests();
  assert.equal(await ensureMikhmonImage(fakeClient([]), COUZA, { migrate: ok }), "already-current");
});

test("ensureMikhmonImage : sf-v1 recréé sur l'image voulue via migrateMikhmonToFlash(force, image)", async () => {
  resetImageUpdateStateForTests();
  let got: Parameters<Migrate>[1] | undefined;
  const spy: Migrate = async (_c, o) => ((got = o), { status: "pulling", message: "" });
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r1", { migrate: spy }), "updated");
  assert.equal(got?.force, true);
  assert.equal(got?.image, MIKHMON_DESIRED_IMAGE);
});

test("ensureMikhmonImage : 3 re-créations par fenêtre de 10 min, puis cap-reached", async () => {
  resetImageUpdateStateForTests();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), `r${i}`, { now: t0, migrate: ok }), "updated");
  }
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r4", { now: t0 + 60_000, migrate: ok }), "cap-reached");
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r4", { now: t0 + 11 * 60_000, migrate: ok }), "updated");
});

test("ensureMikhmonImage : un échec ouvre le coupe-circuit pour tout le parc", async () => {
  resetImageUpdateStateForTests();
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r1", { migrate: ko }), "failed");
  assert.equal(await ensureMikhmonImage(fakeClient([], row(SF)), "r2", { migrate: ok }), "circuit-open");
});
