import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const FULFILL = "src/lib/portal/fulfill.ts";
const FIXES = "src/lib/mikrotik/router-audit-fixes.ts";
const ACTIONS = "src/lib/mikrotik/actions.ts";

test("la livraison du portail n'épingle plus le ticket à une adresse MAC", async () => {
  const source = await read(FULFILL);
  // Les lignes de COMMENTAIRE sont retirées : celle qui documente la
  // correction cite `=mac-address=` pour expliquer son absence, et ferait
  // échouer l'assertion sur un texte au lieu du code.
  const add = source
    .slice(
      source.indexOf('"/ip/hotspot/user/add"'),
      source.indexOf("]);", source.indexOf('"/ip/hotspot/user/add"')),
    )
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  assert.ok(add.length > 0, "la création du user hotspot doit exister");
  assert.match(add, /=name=\$\{code\}/);
  assert.match(add, /=password=\$\{code\}/);
  assert.match(add, /=profile=\$\{profileName\}/);
  // LE bug : le ticket était créé lié au MAC vu à l'achat. Les téléphones
  // changent de MAC privée, et le code devenait irrecevable quelques heures
  // plus tard. L'anti-partage passe par shared-users=1, pas par l'épinglage.
  assert.doesNotMatch(add, /=mac-address=/);
});

test("l'ouverture de session, elle, garde bien le MAC", async () => {
  const source = await read(FULFILL);
  // Distinguer les deux usages : `active/login` cible un hôte précis, c'est
  // légitime et sans rapport avec l'épinglage du compte.
  assert.match(source, /\/ip\/hotspot\/active\/login/);
  assert.match(source, /`=mac-address=\$\{mac\}`/);
});

test("le déliage épargne les comptes de roaming", async () => {
  const source = await read(FIXES);
  const body = source.slice(source.indexOf("export async function unbindMacBoundTickets"));

  // La propagation MAC crée volontairement des comptes dont le NOM EST le MAC,
  // pour l'auto-connexion inter-zones. Les délier casserait le roaming.
  assert.match(body, /normalize\(user\.name\) === normalize\(user\["mac-address"\]\)/);
  assert.match(body, /normalize\(user\.name\) !== normalize\(user\["mac-address"\]\)/);
  assert.match(body, /skippedRoaming: roaming\.length/);
  // Un MAC nul ne compte pas comme un épinglage.
  assert.match(body, /mac !== "00:00:00:00:00:00"/);
  // Effacement du champ, pas suppression du ticket.
  assert.match(body, /"\/ip\/hotspot\/user\/set".*=mac-address=/s);
  assert.doesNotMatch(body, /hotspot\/user\/remove/);
});

test("le détecteur de MAC aléatoire lit le bon bit", async () => {
  const source = await read(FIXES);
  assert.match(source, /export function isRandomizedMac/);
  // Bit « localement administré » = deuxième bit de poids faible du 1er octet.
  // Ce sont les adresses observées sur RUE-NICOLAS (EA:, 96:, 7E:, F6:…).
  assert.match(source, /\(first & 0b10\) !== 0/);
});

test("la correction est disponible par routeur ET sur tout le parc", async () => {
  const source = await read(ACTIONS);

  assert.match(source, /export async function fixRouterMacBoundTickets\(routerId: string\)/);
  assert.match(source, /export async function fixAllRoutersMacBoundTickets\(\)/);
  // Isolation multi-tenant : un admin ne balaie que son organisation.
  assert.match(source, /isSuperAdmin\(session\.role\) \? isNotNull\(routers\.id\) : eq\(routers\.orgId, session\.orgId\)/);
  // Un routeur hors ligne est nommé et n'interrompt pas les autres.
  assert.match(source, /unreachable\.push\(router\.name\)/);
  assert.match(source, /continue;/);
});
