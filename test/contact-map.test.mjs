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
  assert.match(src, /<a\s+href=\{ITINERAIRE\}/s);
  // L'adresse elle-même vit dans lib/site/contact : la carte, le pied de page
  // et la page contact affichent le même fait, il n'en existe qu'une copie.
  const facts = await read("src/lib/site/contact.ts");
  assert.match(facts, /330 Rue Nicolas Amenin, Attécoubé/);
});

test("les coordonnées sont celles de l'URL fournie", async () => {
  const facts = await read("src/lib/site/contact.ts");
  assert.match(facts, /lat: 5\.3453013/);
  assert.match(facts, /lng: -4\.03603/);
  // Pas d'identifiant de lieu inventé : l'URL d'origine encode le place_id en
  // hexadécimal, pas au format ChIJ… attendu par les Maps URLs.
  assert.doesNotMatch(facts, /place_id:/);
  assert.match(facts, /maps\/dir\/\?api=1&destination=/);
});

test("les coordonnées publiques sont affichées et actionnables en pied de page", async () => {
  /* Un visiteur cherche « où sont-ils, comment je les appelle » en bas de page.
     Le numéro doit être composable (tel: sans espaces) et l'adresse mener à la
     carte, sinon ce ne sont que deux lignes de texte mort. */
  const footer = await read("src/components/landing/LandingFooter.tsx");
  assert.match(footer, /href=\{`tel:\$\{SITE_PHONE\}`\}/);
  assert.match(footer, /href=\{SITE_MAP_URL\}/);
  assert.match(footer, /SITE_PHONE_DISPLAY/);

  const facts = await read("src/lib/site/contact.ts");
  // tel: n'accepte ni espace ni parenthèse.
  assert.match(facts, /SITE_PHONE = "\+2250505592052"/);
  assert.match(facts, /youtube\.com\/@SafeLinkHub/);
});

test("aucun lien du pied de page ne pointe dans le vide", async () => {
  /* Vérifié en production : /careers, /support, /legal/terms et /legal/privacy
     renvoyaient 404 sur toutes les pages publiques. Ce test garde la porte
     fermée jusqu'à ce que les pages existent vraiment. */
  const footer = await read("src/components/landing/LandingFooter.tsx");
  const liens = [...footer.matchAll(/href: "(\/[^"]*)"/g)].map((m) => m[1]);
  const { existsSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const racine = fileURLToPath(new URL("../src/app", import.meta.url));
  for (const lien of liens) {
    const chemin = `${racine}${lien === "/" ? "" : lien}/page.tsx`;
    assert.ok(existsSync(chemin), `le pied de page annonce ${lien}, qui n'existe pas`);
  }
});

test("la carte est en pleine largeur, pas dans la colonne latérale", async () => {
  const page = await read("src/app/contact/page.tsx");
  const aside = page.indexOf("</aside>");
  const map = page.indexOf("<MapEmbed />");
  assert.ok(map > aside, "dans une colonne de 5/12 la carte serait illisible");
});
