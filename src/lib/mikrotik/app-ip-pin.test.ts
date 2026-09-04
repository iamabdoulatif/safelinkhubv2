import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_PIN_COMMENT,
  missingPins,
  pinCommands,
  pinnedAddresses,
  sanitizeAppAddresses,
} from "./app-ip-pin";

test("seules des IPv4 valides sont épinglées, sans doublon", () => {
  assert.deepEqual(
    sanitizeAppAddresses(["104.21.13.231", "104.21.13.231", "safelinkhub.io", "999.1.1.1", "172.67.133.105"]),
    ["104.21.13.231", "172.67.133.105"],
  );
});

test("on n'épingle pas la terre entière", () => {
  const beaucoup = ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4", "5.5.5.5"];
  assert.equal(sanitizeAppAddresses(beaucoup).length, 4);
});

test("le DNS est épinglé AVANT l'autorisation : le téléphone doit obtenir ces adresses-là", () => {
  const cmds = pinCommands("safelinkhub.io", ["104.21.13.231", "172.67.133.105"]);
  assert.equal(cmds[0][0], "/ip/dns/static/add");
  assert.ok(cmds[0].includes("=name=safelinkhub.io"));
  assert.ok(cmds[0].includes("=address=104.21.13.231"));
  // 2 entrées DNS + 2 adresses x (tcp + udp) = 6 commandes.
  assert.equal(cmds.length, 6);
  const autorisations = cmds.filter((c) => c[0] === "/ip/hotspot/walled-garden/ip/add");
  assert.equal(autorisations.length, 4);
  // Par ADRESSE, jamais par nom : c'est tout l'objet de l'ancrage.
  assert.ok(autorisations.every((c) => c.some((w) => w.startsWith("=dst-address="))));
  assert.ok(autorisations.every((c) => !c.some((w) => w.startsWith("=dst-host="))));
  assert.ok(autorisations.some((c) => c.includes("=protocol=udp")), "HTTP/3 aussi");
  assert.ok(cmds.every((c) => c.includes(`=comment=${APP_PIN_COMMENT}`)));
});

test("aucune adresse résolue : aucune commande, jamais d'entrée vide", () => {
  assert.deepEqual(pinCommands("safelinkhub.io", []), []);
  assert.deepEqual(pinCommands("safelinkhub.io", ["pas-une-ip"]), []);
});

test("ce qui manque sur le routeur se voit, sans confondre avec vos entrées", () => {
  const rows = [
    { "dst-address": "104.21.13.231", comment: APP_PIN_COMMENT },
    { "dst-address": "8.8.8.8", comment: "règle maison" },
  ];
  assert.deepEqual(pinnedAddresses(rows), ["104.21.13.231"]);
  assert.deepEqual(missingPins(["104.21.13.231", "172.67.133.105"], rows), ["172.67.133.105"]);
  assert.deepEqual(missingPins(["104.21.13.231"], rows), []);
});
