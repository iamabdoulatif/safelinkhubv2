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
    "n-importe-quel-routeur",
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

// L'allowlist canari est vide depuis le 31/10 (ouverture au parc) : tout routeur
// est éligible, et c'est la lignée de l'image qui décide désormais. Une image v7
// ancienne est bien re-créée ; une image hors-v7 ne l'est jamais (test ci-dessous).
test("ensureMikhmonImage : allowlist vide = tout routeur v7 est éligible", async () => {
  const calls: string[][] = [];
  const res = await ensureMikhmonImage(
    fakeClient(calls, {
      ".id": "*1",
      name: "mikhmon",
      "root-dir": "/usb1/mikhmon-app",
      "remote-image": "ghcr.io/iamabdoulatif/mikhmon-v7:ui-cobaye",
      running: "true",
    }),
    "un-autre-routeur",
  );
  assert.notEqual(res, "not-canary");
  assert.notEqual(res, "not-v7");
});

test("ensureMikhmonImage : canari déjà sur l'image voulue = already-current", async () => {
  const res = await ensureMikhmonImage(fakeClient([]), COUZA);
  assert.equal(res, "already-current");
});
