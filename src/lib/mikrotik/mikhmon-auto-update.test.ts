process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMikhmonContainer,
  ensureMikhmonUiFiles,
  ensureMikhmonImage,
  escapeRosString,
  buildConfigRestoreScript,
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

test("ensureMikhmonUiFiles : /tool fetch par fichier vers le bon chemin", async () => {
  const calls: string[][] = [];
  const n = await ensureMikhmonUiFiles(fakeClient(calls));
  assert.equal(n, 4);
  const skin = calls.find((c) => c[0] === "/tool/fetch" && c.some((w) => w.includes("safelink-skin.css")));
  assert.ok(skin!.includes("=url=https://safelinkhub.io/mikhmon-ui/safelink-skin.css"));
  assert.ok(skin!.includes("=dst-path=usb1/mikhmon-app/src/src/css/safelink-skin.css"));
  const responsive = calls.find(
    (c) => c[0] === "/tool/fetch" && c.some((w) => w.includes("mikhmon-responsive.css")),
  );
  assert.ok(responsive!.includes("=url=https://safelinkhub.io/mikhmon-ui/mikhmon-responsive.css"));
  assert.ok(responsive!.includes("=dst-path=usb1/mikhmon-app/src/src/css/mikhmon-responsive.css"));
});

test("escapeRosString : échappe \\ \" $ et retours ligne", () => {
  assert.equal(escapeRosString('a"b'), 'a\\"b');
  assert.equal(escapeRosString("a$b"), "a\\$b");
  assert.equal(escapeRosString("a\\b"), "a\\\\b");
  assert.equal(escapeRosString("a\nb"), "a\\nb");
});

test("buildConfigRestoreScript : /file set du bon chemin, contenu échappé", () => {
  const src = buildConfigRestoreScript("usb1/mikhmon-app", "$data['x']=array();\n");
  assert.ok(src.startsWith("/file set usb1/mikhmon-app/src/src/include/config.php contents=\""));
  assert.ok(src.includes("\\$data")); // $ échappé
  assert.ok(src.includes("\\n")); // newline échappé
});

test("ensureMikhmonImage : routeur hors allowlist = not-canary (aucune re-création)", async () => {
  const calls: string[][] = [];
  const res = await ensureMikhmonImage(fakeClient(calls, { ".id": "*1", name: "mikhmon", "root-dir": "/usb1/mikhmon-app", "remote-image": "vieille-image" }), "un-autre-routeur");
  assert.equal(res, "not-canary");
  assert.equal(calls.length, 0, "ne doit même pas interroger le routeur");
});

test("ensureMikhmonImage : canari déjà sur l'image voulue = already-current", async () => {
  const res = await ensureMikhmonImage(fakeClient([]), COUZA);
  assert.equal(res, "already-current");
});
