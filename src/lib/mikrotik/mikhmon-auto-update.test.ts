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
  assert.equal(res, "disabled");
  assert.equal(calls.length, 0, "ne doit même pas interroger le routeur");
});

test("ensureMikhmonImage : désactivé = disabled (aucune action)", async () => {
  const res = await ensureMikhmonImage(fakeClient([]), COUZA);
  assert.equal(res, "disabled");
});
