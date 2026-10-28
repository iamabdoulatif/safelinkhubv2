process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMikhmonContainer,
  ensureMikhmonUiFiles,
  ensureMikhmonImage,
  reconcileMikhmonAutoUpdate,
  MIKHMON_DESIRED_IMAGE,
} from "./mikhmon-auto-update";
import type { RouterOSClient } from "./client";

function fakeClient(calls: string[][], containerRow?: Record<string, string>): RouterOSClient {
  const row = containerRow ?? {
    ".id": "*1",
    name: "mikhmon-sf-v1:latest",
    "root-dir": "/usb1/mikhmon-app",
    "remote-image": MIKHMON_DESIRED_IMAGE,
    running: "true",
  };
  return {
    talk: async (cmd: string[]) => {
      calls.push(cmd);
      if (cmd[0] === "/container/print") return row ? [row] : [];
      return [];
    },
  } as unknown as RouterOSClient;
}

test("findMikhmonContainer : parse root-dir sans slash de tête", async () => {
  const c = await findMikhmonContainer(fakeClient([]));
  assert.equal(c?.rootDir, "usb1/mikhmon-app");
  assert.equal(c?.running, true);
  assert.equal(c?.remoteImage, MIKHMON_DESIRED_IMAGE);
});

test("findMikhmonContainer : null si aucun conteneur", async () => {
  const calls: string[][] = [];
  const c = await findMikhmonContainer({
    talk: async (cmd: string[]) => {
      calls.push(cmd);
      return [];
    },
  } as unknown as RouterOSClient);
  assert.equal(c, null);
});

test("ensureMikhmonUiFiles : /tool fetch pour chaque fichier vers le bon chemin", async () => {
  const calls: string[][] = [];
  const n = await ensureMikhmonUiFiles(fakeClient(calls));
  assert.equal(n, 3);
  const fetches = calls.filter((c) => c[0] === "/tool/fetch");
  assert.equal(fetches.length, 3);
  // skin : URL app + dst dans le conteneur
  const skin = fetches.find((f) => f.some((w) => w.includes("safelink-skin.css")));
  assert.ok(skin);
  assert.ok(skin!.includes("=url=https://safelinkhub.io/mikhmon-ui/safelink-skin.css"));
  assert.ok(skin!.includes("=dst-path=usb1/mikhmon-app/src/src/css/safelink-skin.css"));
  // headhtml : servi en .txt, déposé en .php
  const head = fetches.find((f) => f.some((w) => w.includes("headhtml")));
  assert.ok(head!.includes("=url=https://safelinkhub.io/mikhmon-ui/headhtml.txt"));
  assert.ok(head!.includes("=dst-path=usb1/mikhmon-app/src/src/include/headhtml.php"));
});

test("ensureMikhmonUiFiles : -1 si pas de conteneur MikHmon", async () => {
  const n = await ensureMikhmonUiFiles({
    talk: async () => [],
  } as unknown as RouterOSClient);
  assert.equal(n, -1);
});

test("ensureMikhmonImage : skipped quand désactivé (garde-fou)", async () => {
  let recreateCalled = false;
  const res = await ensureMikhmonImage(
    fakeClient([], { ".id": "*1", name: "mikhmon", "root-dir": "/usb1/mikhmon-app", "remote-image": "vieille-image" }),
    "router-1",
    async () => {
      recreateCalled = true;
      return true;
    },
  );
  assert.equal(res, "skipped");
  assert.equal(recreateCalled, false, "la re-création ne doit JAMAIS tourner tant que le garde-fou est actif");
});

test("reconcileMikhmonAutoUpdate : dépose l'habillage une seule fois par routeur", async () => {
  const calls: string[][] = [];
  const client = fakeClient(calls);
  await reconcileMikhmonAutoUpdate(client, "router-unique-1");
  const first = calls.filter((c) => c[0] === "/tool/fetch").length;
  assert.equal(first, 3);
  await reconcileMikhmonAutoUpdate(client, "router-unique-1");
  const second = calls.filter((c) => c[0] === "/tool/fetch").length;
  assert.equal(second, 3, "2e passage = no-op (versionné)");
});
