import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("aucune requête vers Google avant que le visiteur ouvre la carte", async () => {
  // Une iframe Maps posée directement contacte Google — et dépose ses cookies —
  // au chargement, pour tout visiteur. Même façade que le lecteur vidéo.
  const src = await read("src/components/landing/MapEmbed.tsx");
  const i = src.indexOf("ouverte ? (");
  assert.ok(i > 0, "le rendu doit être conditionné à l'ouverture");
  assert.ok(src.indexOf("<iframe") > i, "l'iframe ne doit exister que dans la branche ouverte");
});

test("l'adresse reste lisible sans JavaScript", async () => {
  // Un point sur une carte n'est ni indexable ni lisible par un lecteur
  // d'écran ; l'adresse doit être du vrai texte, et le lien d'itinéraire un
  // vrai lien.
  const src = await read("src/components/landing/MapEmbed.tsx");
  assert.match(src, /<address/);
  assert.match(src, /330 Rue Nicolas Amenin, Attécoubé/);
  assert.match(src, /<a\s+href=\{ITINERAIRE\}/s);
});

test("les coordonnées sont celles de l'URL fournie", async () => {
  const src = await read("src/components/landing/MapEmbed.tsx");
  assert.match(src, /const LAT = 5\.3453013;/);
  assert.match(src, /const LNG = -4\.03603;/);
  // Pas d'identifiant de lieu inventé : l'URL d'origine encode le place_id en
  // hexadécimal, pas au format ChIJ… attendu par les Maps URLs.
  assert.doesNotMatch(src, /place_id:/);
  assert.match(src, /maps\/dir\/\?api=1&destination=/);
});

test("la carte est en pleine largeur, pas dans la colonne latérale", async () => {
  const page = await read("src/app/contact/page.tsx");
  const aside = page.indexOf("</aside>");
  const map = page.indexOf("<MapEmbed />");
  assert.ok(map > aside, "dans une colonne de 5/12 la carte serait illisible");
});
