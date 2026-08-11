import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const MODULE = "src/lib/mikrotik/hotspot-connectivity-diagnosis.ts";
const ACTIONS = "src/lib/mikrotik/serial-transfer-actions.ts";
const PANEL = "src/app/admin/router/[id]/TicketDiagnosisPanel.tsx";

test("le diagnostic n'écrit jamais sur le routeur", async () => {
  const source = await read(MODULE);

  // Les remèdes diffèrent selon la cause, et certains relèvent d'un arbitrage
  // produit (le mac-cookie est délibéré) : on constate, on n'arbitre pas.
  for (const mutation of ["/add", "/set", "/remove", "/enable", "/disable"]) {
    assert.ok(!source.includes(`${mutation}"`), `aucun ${mutation} ne doit apparaître`);
  }
  // Il ne lit que des /print.
  for (const cmd of [
    "/ip/pool/print",
    "/ip/pool/used/print",
    "/ip/hotspot/active/print",
    "/ip/hotspot/cookie/print",
    "/log/print",
  ]) {
    assert.ok(source.includes(cmd), `doit lire ${cmd}`);
  }
});

test("un routeur muet ne fait pas échouer le diagnostic", async () => {
  const source = await read(MODULE);

  // Chaque lecture passe par `safe` : une commande refusée (menu absent,
  // droits) renvoie un tableau vide au lieu de faire tomber tout le panneau.
  assert.match(source, /const safe = async <T>\([\s\S]{0,160}\.catch\(\(\) => fallback\)/);
});

test("le journal du routeur est remonté — c'est lui qui donne le motif", async () => {
  const source = await read(MODULE);

  assert.match(source, /\/log\/print/);
  assert.match(source, /\/hotspot\/i\.test/);
  assert.match(source, /recentLog/);
});

test("les causes classiques sont nommées, pas devinées", async () => {
  const source = await read(MODULE);

  // Pool saturé : le client n'obtient pas d'IP et n'atteint jamais le portail —
  // le ticket paraît refusé alors qu'il n'a jamais été soumis.
  assert.match(source, /saturation >= 90/);
  assert.match(source, /n'atteint même pas le portail/);
  // Session déjà ouverte avec shared-users=1.
  assert.match(source, /activeSession[\s\S]{0,200}shared-users=1/);
  // Verrouillage MAC résiduel : renvoie vers l'outil qui le corrige.
  assert.match(source, /Délier les tickets MAC/);
  // Profil disparu sous le ticket.
  assert.match(source, /n'existe plus/);
});

test("le panneau est réservé aux routeurs joignables et scopé à l'organisation", async () => {
  const [actions, panel] = await Promise.all([read(ACTIONS), read(PANEL)]);

  assert.match(
    actions,
    /router\.orgId !== session\.orgId && !isSuperAdmin\(session\.role\)/,
    "un admin ne diagnostique que ses propres routeurs",
  );
  // Tout est lu en direct : le panneau n'a aucun sens hors ligne.
  assert.match(panel, /diagnoseTicketConnectivity/);
});
