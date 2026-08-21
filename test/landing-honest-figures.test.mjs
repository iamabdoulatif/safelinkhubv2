import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

/** Le code SANS ses commentaires : c'est ce qui part au navigateur.
 *  Les commentaires citent volontairement les anciennes valeurs pour expliquer
 *  ce qu'on ne veut plus voir — les inclure ferait échouer le test sur sa
 *  propre documentation. */
const shipped = async (p) =>
  (await read(p)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* Les cartes du hero ont affiché en production, pendant plusieurs jours,
 * 18 742 000 FCFA sur trente jours et 486 500 FCFA le jour même. Valeurs de
 * maquette parties en ligne. Mesuré le 20/08/2026 : 1 750 FCFA sur trente
 * jours et zéro commande payée. Ces tests empêchent la rechute. */

test("le hero n'annonce plus aucun montant", async () => {
  const hero = await shipped("src/components/landing/Hero.tsx");
  assert.doesNotMatch(hero, /FCFA/, "aucun montant ne doit être affiché dans le hero");
  // Et surtout pas les anciens.
  for (const faux of ["18 742 000", "486 500", "99,2", "1 842"]) {
    assert.ok(!hero.includes(faux), `« ${faux} » était une valeur inventée`);
  }
});

test("les chiffres du hero viennent de la base, pas du fichier", async () => {
  const hero = await read("src/components/landing/Hero.tsx");
  assert.match(hero, /stats\.routers/);
  assert.match(hero, /stats\.sessions/);
  // Les deux volumes mesurés sont masqués si la base n'a pas répondu :
  // « 0 routeur supervisé » serait pire que ne rien dire, même si la plaque
  // conserve son intitulé dans la scène MikroTik.
  assert.match(hero, /stats\.routers > 0 \? nf\.format\(stats\.routers\) : undefined/);
  assert.match(hero, /stats\.sessions > 0 \? nf\.format\(stats\.sessions\) : undefined/);
});

test("la requête de la landing ne touche à aucune recette", async () => {
  const stats = await shipped("src/lib/landing/platform-stats.ts");
  for (const money of ["price", "amount", "sold_", "portalOrders", "vouchers"]) {
    assert.ok(!stats.includes(money), `platform-stats ne doit pas lire ${money}`);
  }
  // Et elle ne compte pas les sessions des routeurs tombés, comme le dashboard.
  assert.match(stats, /filter \(where \$\{routers\.status\} = 'online'\)/);
});

test("le compte des opérateurs et sa légende sortent de la même liste", async () => {
  // Le hero a affiché « 5 » sous une légende qui n'en nommait que quatre :
  // WALLET_PAYMENT_METHODS inclut la carte bancaire.
  const stats = await read("src/lib/landing/platform-stats.ts");
  assert.match(stats, /filter\(\(m\) => m\.id !== "card"\)/);
  const hero = await read("src/components/landing/Hero.tsx");
  assert.match(hero, /stats\.mobileMoney\.length/);
  assert.match(hero, /stats\.mobileMoney\.join/);
});

test("la section revendeur importe ses prix, ne les recopie pas", async () => {
  const sec = await shipped("src/components/landing/ResellerSection.tsx");
  assert.match(sec, /from "@\/lib\/billing\/reseller"/);
  assert.match(sec, /from "@\/lib\/billing\/auto-setup-pricing"/);
  // Aucun montant en dur : la page ne peut pas annoncer un prix que le débit
  // ne pratique pas.
  assert.doesNotMatch(sec, /\b40[  ]?000\b/, "le prix du pack doit venir de RESELLER_PACK_FCFA");
  assert.doesNotMatch(sec, /\b10[  ]?000\b/, "le tarif public doit venir de AUTO_SETUP_FEE_CENTS");
  assert.doesNotMatch(sec, /\b800\b/, "le tarif revendeur doit venir de RESELLER_SETUP_FEE_CENTS");
});
