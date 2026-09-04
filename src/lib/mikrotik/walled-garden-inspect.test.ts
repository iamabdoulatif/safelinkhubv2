import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectWalledGarden,
  walledGardenBloquant,
  walledGardenIncomplet,
  walledGardenDetail,
} from "./walled-garden-inspect";

const attendus = {
  l7: ["safelinkhub.io", "*.safelinkhub.io", "checkout.geniuspay.io"],
  ip: ["safelinkhub.io", "checkout.geniuspay.io"],
  appHost: "safelinkhub.io",
};

const ligne = (h: string) => ({ "dst-host": h });

test("liste complète : rien à signaler", () => {
  const state = inspectWalledGarden(
    attendus.l7.map(ligne),
    attendus.ip.map(ligne),
    attendus,
  );
  assert.equal(walledGardenBloquant(state), false);
  assert.equal(walledGardenIncomplet(state), false);
});

test("l'app autorisée en HTTP mais pas en HTTPS reste bloquante", () => {
  // Le portail joint l'API en HTTPS : la seule table L7 ne suffit pas.
  const state = inspectWalledGarden(attendus.l7.map(ligne), [ligne("checkout.geniuspay.io")], attendus);
  assert.equal(state.appJoignable, false);
  assert.equal(walledGardenBloquant(state), true);
  assert.deepEqual(state.manquantsIp, ["safelinkhub.io"]);
  assert.match(walledGardenDetail(state, "safelinkhub.io"), /port 443/);
});

test("entrées empoisonnées par un serveur de développement", () => {
  const state = inspectWalledGarden(
    [ligne("0.0.0.0:3000"), ligne("*.0.0.0.0:3000")],
    [],
    attendus,
  );
  assert.equal(walledGardenBloquant(state), true);
  assert.deepEqual(state.perimes, ["0.0.0.0:3000", "*.0.0.0.0:3000"]);
  assert.match(walledGardenDetail(state, "safelinkhub.io"), /périmées/);
});

test("un hôte de paiement manquant n'est pas bloquant, seulement incomplet", () => {
  const state = inspectWalledGarden(
    [ligne("safelinkhub.io"), ligne("*.safelinkhub.io")],
    [ligne("safelinkhub.io")],
    attendus,
  );
  assert.equal(walledGardenBloquant(state), false);
  assert.equal(walledGardenIncomplet(state), true);
  assert.deepEqual(state.manquants, ["checkout.geniuspay.io"]);
});

test("la casse d'un dst-host ne fait pas croire à un manque", () => {
  const state = inspectWalledGarden(
    attendus.l7.map((h) => ligne(h.toUpperCase())),
    attendus.ip.map((h) => ligne(h.toUpperCase())),
    attendus,
  );
  assert.equal(walledGardenBloquant(state), false);
  assert.deepEqual(state.perimes, []);
});

test("la règle par nom ne suffit pas : sans ancrage par adresse, c'est bloquant", () => {
  // Le cas YAHYA WIFI : safelinkhub.io figure dans les deux tables, et le
  // portail n'y arrive toujours pas parce que rien n'accepte SES adresses.
  const state = inspectWalledGarden(
    attendus.l7.map(ligne),
    attendus.ip.map(ligne),
    { ...attendus, addresses: ["104.21.13.231", "172.67.133.105"] },
  );
  assert.equal(state.appJoignable, true, "le nom est bien autorisé");
  assert.deepEqual(state.ancrageManquant, ["104.21.13.231", "172.67.133.105"]);
  assert.equal(walledGardenBloquant(state), true);
  assert.match(walledGardenDetail(state, "safelinkhub.io"), /n'est pas ancré/);
});

test("ancrage posé : plus rien à signaler", () => {
  const state = inspectWalledGarden(
    attendus.l7.map(ligne),
    [
      ...attendus.ip.map(ligne),
      { "dst-address": "104.21.13.231", comment: "safelinkhub-app-pin" },
      { "dst-address": "172.67.133.105", comment: "safelinkhub-app-pin" },
    ],
    { ...attendus, addresses: ["104.21.13.231", "172.67.133.105"] },
  );
  assert.deepEqual(state.ancrageManquant, []);
  assert.equal(walledGardenBloquant(state), false);
  assert.deepEqual(state.ancrees, ["104.21.13.231", "172.67.133.105"]);
});
