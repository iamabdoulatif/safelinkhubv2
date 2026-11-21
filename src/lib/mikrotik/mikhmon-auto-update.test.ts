process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMikhmonContainer,
  ensureMikhmonUiFiles,
  ensureMikhmonImage,
  recreateMikhmonOnImage,
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

test.skip("ensureMikhmonImage : routeur hors allowlist = not-canary (aucune re-création)", async () => {
  const calls: string[][] = [];
  const res = await ensureMikhmonImage(fakeClient(calls, { ".id": "*1", name: "mikhmon", "root-dir": "/usb1/mikhmon-app", "remote-image": "vieille-image" }), "un-autre-routeur");
  assert.equal(res, "not-canary");
  assert.equal(calls.length, 0, "ne doit même pas interroger le routeur");
});

test.skip("ensureMikhmonImage : canari déjà sur l'image voulue = already-current", async () => {
  const res = await ensureMikhmonImage(fakeClient([]), COUZA);
  assert.equal(res, "already-current");
});

/* Faux routeur pour recreateMikhmonOnImage : un conteneur sur une vieille image,
   config.php lisible, et des pannes injectables sur remove / add. */
function recreateClient(opts: { removeFails?: number; addFailsFor?: string[]; stoppingPolls?: number } = {}) {
  const calls: string[][] = [];
  let removeFails = opts.removeFails ?? 0;
  let stoppingPolls = opts.stoppingPolls ?? 0;
  let container: Record<string, string> | null = {
    ".id": "*1",
    name: "mikhmon-sf-v1:latest",
    "root-dir": "flash/mikhmon-app",
    "remote-image": "latif225/mikhmon-sf-v1:latest",
    running: "true",
    status: "running",
  };
  const client = {
    talk: async (cmd: string[]) => {
      calls.push(cmd);
      const verb = cmd[0];
      if (verb === "/file/get") return [{ ret: "<?php $data['SafeLinkHub'] = array('x'); // config assez longue pour passer le garde-fou" }];
      if (verb === "/container/print") {
        if (container && container.status === "stopping" && stoppingPolls-- <= 0) container.status = "stopped";
        return container ? [container] : [];
      }
      if (verb === "/container/stop" && container) {
        container.running = "false";
        container.status = stoppingPolls > 0 ? "stopping" : "stopped";
      }
      if (verb === "/container/start" && container) {
        container.running = "true";
        container.status = "running";
      }
      if (verb === "/container/remove") {
        if (container?.status !== "stopped" || removeFails-- > 0) throw new Error("cannot remove");
        container = null;
      }
      if (verb === "/container/add") {
        const img = cmd.find((w) => w.startsWith("=remote-image="))!.slice("=remote-image=".length);
        if (opts.addFailsFor?.includes(img)) throw new Error("add failed");
        container = { ".id": "*2", name: img, "root-dir": "flash/mikhmon-app", "remote-image": img, running: "true", status: "running" };
      }
      return [];
    },
  } as unknown as RouterOSClient;
  return { client, calls, current: () => container };
}

const UI2 = "ghcr.io/iamabdoulatif/mikhmon-v7:ui-2";
const fast = { pollMs: 1, runMs: 50 };

test("recreateMikhmonOnImage : attend « stopped » (pas seulement running=false) avant remove", async () => {
  const r = recreateClient({ stoppingPolls: 2 });
  assert.equal(await recreateMikhmonOnImage(r.client, UI2, fast), "updated");
  assert.equal(r.current()?.["remote-image"], UI2);
});

test("recreateMikhmonOnImage : remove qui échoue = conteneur d'origine RELANCÉ", async () => {
  const r = recreateClient({ removeFails: 99 });
  assert.equal(await recreateMikhmonOnImage(r.client, UI2, fast), "failed");
  assert.equal(r.current()?.["remote-image"], "latif225/mikhmon-sf-v1:latest");
  assert.equal(r.current()?.running, "true", "le conteneur est resté arrêté");
  assert.equal(r.calls.filter((c) => c[0] === "/container/remove").length, 3, "remove réessayé 3 fois");
});

test("recreateMikhmonOnImage : remove qui échoue une fois puis passe = updated", async () => {
  const r = recreateClient({ removeFails: 1 });
  assert.equal(await recreateMikhmonOnImage(r.client, UI2, fast), "updated");
  assert.equal(r.current()?.["remote-image"], UI2);
});

test("recreateMikhmonOnImage : add qui échoue = ancienne image remise au même endroit", async () => {
  const r = recreateClient({ addFailsFor: [UI2] });
  assert.equal(await recreateMikhmonOnImage(r.client, UI2, fast), "failed");
  assert.equal(r.current()?.["remote-image"], "latif225/mikhmon-sf-v1:latest");
  assert.equal(r.current()?.["root-dir"], "flash/mikhmon-app");
  assert.equal(r.current()?.running, "true");
});
