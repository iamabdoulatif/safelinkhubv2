process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMikhmonContainer,
  ensureMikhmonUiFiles,
  ensureMikhmonImage,
  isMikhmonV7Image,
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

test("ensureMikhmonImage : un conteneur v3 n'est JAMAIS re-créé (not-v7)", async () => {
  // /container/remove est irréversible et v3 → v7 est une migration, pas une
  // mise à jour : le cron ne doit pas la déclencher tout seul.
  const calls: string[][] = [];
  const res = await ensureMikhmonImage(
    fakeClient(calls, {
      ".id": "*1",
      name: "mikhmonv3-safelinkhub:latest",
      "root-dir": "/mikhmonv3",
      "remote-image": "latif225/mikhmonv3-safelinkhub:latest",
      running: "true",
    }),
    // Un CANARI : sans ça on sortirait sur « not-canary » et le garde-fou v7
    // ne serait jamais exercé par ce test.
    COUZA,
  );
  assert.equal(res, "not-v7");
  assert.equal(calls.filter((c) => c[0] === "/container/remove").length, 0);
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
