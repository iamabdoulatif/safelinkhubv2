import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const SUBNET = "src/lib/net/subnet.ts";
const WIZARD = "src/app/admin/router/[id]/ServicesWizard.tsx";
const TOPOLOGY = "src/app/admin/settings/router-setup/TopologyBuilder.tsx";

test("la plage de préfixes va de /8 à /24", async () => {
  const source = await read(SUBNET);
  assert.match(source, /any: rangeArray\(8, 24\)/);
});

test("aucun écran ne recopie la liste des préfixes", async () => {
  const [wizard, topology] = await Promise.all([read(WIZARD), read(TOPOLOGY)]);

  // Le wizard portait sa PROPRE liste [24,23,22,21,20,19] et s'arrêtait donc à
  // /19, alors que le helper couvrait /8..24 et que le Topology Builder, lui,
  // lisait déjà la liste partagée. Les deux écrans avaient divergé — c'est
  // exactement ce que le commentaire du helper dit vouloir éviter.
  for (const [name, source] of [["ServicesWizard", wizard], ["TopologyBuilder", topology]]) {
    assert.match(source, /CLASS_PREFIX_OPTIONS/, `${name} doit lire la liste partagée`);
    assert.doesNotMatch(
      source,
      /\[24, 23, 22, 21, 20, 19\]/,
      `${name} ne doit plus recopier la liste`,
    );
  }
});

test("le wizard explique le coût du préfixe choisi", async () => {
  const wizard = await read(WIZARD);
  const subnet = await read(SUBNET);

  // Un /8 réserve 16,7 millions d'adresses : le helper a déjà la note, elle
  // doit être montrée au moment du choix.
  assert.match(wizard, /getImpactNote\(subnetBits\)/);
  assert.match(subnet, /16,7M d'adresses/);
});

test("les grands préfixes ne font énumérer aucune adresse", async () => {
  const source = await read(SUBNET);
  const pool = source.slice(source.indexOf("export function poolRangeExcludingGateway"));

  // Le pool DHCP est une plage « début-fin » calculée en arithmétique entière.
  // Toute construction de tableau ici ferait 16,7 millions d'entrées sur un /8.
  assert.doesNotMatch(pool, /Array\.from|for \(|\.map\(/);
  assert.match(pool, /`\$\{intToIp\(poolStartInt\)\}-\$\{subnet\.lastUsable\}`/);
});

test("les passerelles proposées sont groupées par bloc privé", async () => {
  const source = await read(SUBNET);

  assert.match(source, /export const GATEWAY_IP_PRESET_GROUPS/);
  // La vue à plat reste dérivée du groupé : impossible qu'elles divergent.
  assert.match(source, /GATEWAY_IP_PRESET_GROUPS\.flatMap/);
  // Le libellé porte l'avertissement : une passerelle en 192.168 en aval d'une
  // box FAI crée un conflit de routage. Une pastille ne pouvait pas le dire.
  assert.match(source, /192\.168\.0\.0\/16 — attention/);
  assert.match(source, /10\.0\.0\.0\/8 — recommandé/);
});

test("les deux écrans lisent la liste partagée, dans un sélecteur", async () => {
  const [wizard, topology] = await Promise.all([read(WIZARD), read(TOPOLOGY)]);

  for (const [name, source] of [["ServicesWizard", wizard], ["TopologyBuilder", topology]]) {
    assert.match(source, /GATEWAY_IP_PRESET_GROUPS\.map/, `${name} doit rendre les groupes`);
    assert.match(source, /<optgroup/, `${name} doit grouper les options`);
    // Le champ libre survit au sélecteur : une passerelle hors liste reste
    // saisissable, et le sélecteur retombe simplement sur son option vide.
    assert.match(
      source,
      /GATEWAY_IP_PRESETS\.includes\(gatewayIp\) \? gatewayIp : ""/,
      `${name} doit tolérer une adresse hors liste`,
    );
  }
  // Et le wizard ne garde plus sa propre liste de 4 adresses.
  assert.doesNotMatch(wizard, /const GATEWAY_PRESETS =/);
});
