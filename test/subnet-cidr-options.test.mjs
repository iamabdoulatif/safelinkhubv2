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
