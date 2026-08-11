import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const SERVICE = "src/lib/mikrotik/router-serial-lock.ts";
const ACTIONS = "src/lib/mikrotik/serial-transfer-actions.ts";
const PANEL = "src/app/admin/router/[id]/SerialLockPanel.tsx";
const PAGE = "src/app/admin/router/[id]/page.tsx";

test("le transfert est une écriture unique, pas un libérer-puis-reprendre", async () => {
  const source = await read(SERVICE);
  const body = source.slice(source.indexOf("export async function transferRouterSerialLock"));

  // Libérer laisserait le SN en course : le premier routeur qui se synchronise
  // le reprend, y compris l'ancien s'il tourne encore chez son propriétaire.
  // Le transfert désigne le gagnant en une seule mise à jour.
  assert.match(body, /\.update\(routerSerialLocks\)[\s\S]{0,300}routerId: target\.routerId/);
  assert.match(body, /releasedAt: null/);
  assert.doesNotMatch(body, /releaseRouterSerialLock\(/);
});

test("les deux routeurs réévaluent leur légitimité après un transfert", async () => {
  const source = await read(SERVICE);

  // serialArmed met en cache les SUCCÈS : sans invalidation, l'ancien détenteur
  // se croirait encore légitime jusqu'au redémarrage du process.
  assert.match(source, /export function forgetArmedSerial/);
  assert.match(source, /forgetArmedSerial\(target\.routerId\)/);
  assert.match(source, /if \(from\?\.routerId\) forgetArmedSerial\(from\.routerId\)/);
});

test("le diagnostic n'écrit rien, et le transfert exige un blocage réel", async () => {
  const source = await read(ACTIONS);
  const inspect = source.slice(
    source.indexOf("export async function inspectRouterSerialLock"),
    source.indexOf("export async function transferRouterSerialToThisRouter"),
  );

  assert.ok(inspect.length > 0);
  assert.doesNotMatch(inspect, /\.update\(|\.insert\(|\.delete\(/);
  // On ne transfère pas un verrou qui ne bloque personne.
  assert.match(source, /if \(!inspection\.blocked\)[\s\S]{0,120}n'est bloqué par aucun verrou/);
});

test("les deux actions sont réservées au superadmin", async () => {
  const source = await read(ACTIONS);
  const guards = source.match(/if \(!session \|\| !isSuperAdmin\(session\.role\)\) return \{ error: "Réservé au superadmin\." \}/g);
  assert.ok(guards && guards.length >= 2, "chaque action exportée doit porter la garde");
});

test("un transfert laisse une trace chez les DEUX organisations", async () => {
  const source = await read(ACTIONS);

  // Retirer un appareil du compte d'un tiers ne doit pas pouvoir se faire sans
  // trace côté perdant comme côté gagnant.
  assert.match(source, /action: `serial_transferred_out:\$\{inspection\.serial\}`/);
  assert.match(source, /action: `serial_transferred_in:\$\{inspection\.serial\}`/);
  assert.match(source, /actorUserId: session\.userId/);
});

test("l'interface impose de constater avant de transférer, avec confirmation nommée", async () => {
  const [panel, page] = await Promise.all([read(PANEL), read(PAGE)]);

  // Pas de bouton de transfert tant qu'aucun scan n'a rapporté un blocage.
  assert.match(panel, /\{scan && !done && \(/);
  assert.match(panel, /!scan\.blocked \?/);
  // Deuxième palier : la confirmation nomme l'organisation dépossédée.
  assert.match(panel, /confirming/);
  assert.match(panel, /scan\.holder\?\.orgName/);
  // Le panneau n'apparaît que pour un superadmin, et seulement si hors ligne.
  assert.match(page, /isSuperAdmin\(session\?\.role\) && !online && <SerialLockPanel/);
});

test("un verrou orphelin ne bloque plus personne", async () => {
  const [service, actions] = await Promise.all([read(SERVICE), read(ACTIONS)]);

  // router_id et org_id sont en ON DELETE SET NULL : supprimer le routeur vide
  // la référence mais laissait la ligne ACTIVE, bloquant le numéro de série à
  // vie sans aucune installation à défendre et sans moyen de le libérer.
  assert.match(service, /const orphan = existing\.routerId === null \|\| existing\.orgId === null/);
  assert.match(service, /if \(active && !orphan && existing\.orgId !== orgId && !opts\?\.force\)/);
  // Le diagnostic doit dire la même chose que la règle, sinon le panneau
  // nommerait un « routeur supprimé » comme détenteur d'un verrou inopérant.
  assert.match(actions, /lock\.routerId === null \|\| lock\.orgId === null/);
  assert.match(actions, /lock\.routerId === routerId \|\| orphan/);
});
