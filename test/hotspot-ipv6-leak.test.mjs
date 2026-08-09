import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const MODULE = "src/lib/mikrotik/hotspot-ipv6-leak.ts";
const ACTIONS = "src/lib/mikrotik/actions.ts";
const BUTTON = "src/app/admin/router/HotspotIpv6Button.tsx";

test("le diagnostic constate AVANT de déduire", async () => {
  const source = await read(MODULE);

  // La preuve factuelle : les clients détiennent-ils une IPv6 globale ? Elle
  // seule attrape le cas où la box du FAI est pontée sur le segment client —
  // le routeur n'annonce alors rien et la déduction conclurait à tort au calme.
  assert.match(source, /\/ipv6\/neighbor\/print/);
  assert.match(source, /clientsWithIpv6 > 0 \|\| \(hasGlobalIpv6 && advertisingBridges\.length > 0\)/);
  // Source amont = clients porteurs alors que le routeur n'annonce pas.
  assert.match(source, /upstreamSource = clientsWithIpv6 > 0 && advertisingBridges\.length === 0/);
  // Paquet IPv6 absent : le menu /ipv6 n'existe pas, l'appel échoue, on conclut.
  assert.match(source, /ipv6Enabled: false[\s\S]{0,400}aucune fuite possible/);
  // Lien-local et unique-local ne sortent pas sur Internet : ne pas les compter.
  assert.match(source, /!address\.startsWith\("fe80:"\)/);
  assert.match(source, /!address\.startsWith\("fc"\) && !address\.startsWith\("fd"\)/);
});

test("le diagnostic n'écrit rien sur le routeur", async () => {
  const source = await read(MODULE);
  const inspect = source.slice(
    source.indexOf("export async function inspectHotspotIpv6"),
    source.indexOf("export type HotspotIpv6BlockResult"),
  );

  assert.ok(inspect.length > 0);
  for (const mutation of ["/add", "/set", "/remove"]) {
    assert.ok(
      !inspect.includes(`"/ipv6/nd${mutation}"`) &&
        !inspect.includes(`"/ipv6/firewall/filter${mutation}"`),
      `le diagnostic ne doit jamais appeler ${mutation}`,
    );
  }
  assert.match(inspect, /\/ipv6\/address\/print/);
  assert.match(inspect, /\/ipv6\/nd\/print/);
  assert.match(inspect, /\/ipv6\/neighbor\/print/);
});

test("le filtre de PONT couvre la box du FAI pontée sur le segment client", async () => {
  const source = await read(MODULE);
  const block = source.slice(
    source.indexOf("export async function blockHotspotIpv6"),
    source.indexOf("export async function unblockHotspotIpv6"),
  );

  // En topologie pontée, le trafic client ne traverse jamais la pile IPv6 du
  // routeur : la règle /ipv6/firewall ne le voit pas. Il faut filtrer au pont.
  assert.match(block, /"\/interface\/bridge\/filter\/add"/);
  assert.match(block, /"=mac-protocol=ipv6"/);
  // Scopé au bridge hotspot : le pont des conteneurs n'est pas concerné.
  assert.match(block, /`=in-bridge=\$\{bridge\}`/);
  assert.match(block, /"=chain=forward"/);

  // Et le retrait le reprend.
  const undo = source.slice(source.indexOf("export async function unblockHotspotIpv6"));
  assert.match(undo, /\/interface\/bridge\/filter\/remove/);
});

test("la correction est marquée, donc réversible", async () => {
  const source = await read(MODULE);

  assert.match(source, /export const HOTSPOT_IPV6_COMMENT/);
  // Les deux verrous portent la marque…
  assert.match(source, /"\/ipv6\/firewall\/filter\/add"[\s\S]{0,240}HOTSPOT_IPV6_COMMENT/);
  assert.match(source, /"\/ipv6\/nd\/add"[\s\S]{0,160}HOTSPOT_IPV6_COMMENT/);
  // …et le retrait ne cible QUE ce qui porte la marque.
  const undo = source.slice(source.indexOf("export async function unblockHotspotIpv6"));
  assert.match(undo, /\/ipv6\/firewall\/filter\/print", `\?comment=\$\{HOTSPOT_IPV6_COMMENT\}/);
  assert.match(undo, /\/ipv6\/nd\/print", `\?comment=\$\{HOTSPOT_IPV6_COMMENT\}/);
});

test("la correction ne coupe que les clients, pas le routeur", async () => {
  const source = await read(MODULE);
  const block = source.slice(
    source.indexOf("export async function blockHotspotIpv6"),
    source.indexOf("export async function unblockHotspotIpv6"),
  );

  // La règle vise le trafic TRAVERSANT venant du bridge hotspot. Pas de chain
  // input ni output : le management, le tunnel et les mises à jour du routeur
  // lui-même doivent continuer de fonctionner.
  assert.match(block, /"=chain=forward"/);
  assert.doesNotMatch(block, /"=chain=input"/);
  assert.doesNotMatch(block, /"=chain=output"/);
  assert.match(block, /`=in-interface=\$\{bridge\}`/);
});

test("le parc est diagnostiqué avant d'être modifié", async () => {
  const [actions, button] = await Promise.all([read(ACTIONS), read(BUTTON)]);

  assert.match(actions, /export async function scanFleetHotspotIpv6/);
  assert.match(actions, /export async function fixFleetHotspotIpv6/);
  // La correction ne touche QUE les routeurs déclarés en fuite.
  assert.match(actions, /if \(!found\.leaking\) \{\s*skipped \+= 1;\s*continue;\s*\}/);
  // Isolation multi-tenant sur les deux.
  const scoped = actions.match(/isSuperAdmin\(session\.role\) \? isNotNull\(routers\.id\) : eq\(routers\.orgId, session\.orgId\)/g);
  assert.ok(scoped && scoped.length >= 2, "les deux actions doivent être scopées à l'organisation");
  // L'UI impose de constater avant de corriger : pas de bouton de correction
  // tant qu'aucun scan n'a rapporté de fuite.
  assert.match(button, /\{scan && !done && \(/);
  assert.match(button, /scan\.leaking\.length > 0 && \(/);
});
