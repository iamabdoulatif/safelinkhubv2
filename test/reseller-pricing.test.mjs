import test from "node:test";
import assert from "node:assert/strict";
import {
  resellerState,
  setupFeeCentsFor,
  resellerExpiryFrom,
  RESELLER_QUOTA,
  RESELLER_SETUP_FEE_CENTS,
  RESELLER_PACK_FCFA,
} from "../src/lib/billing/reseller.ts";
import { autoSetupFeeCentsFor, AUTO_SETUP_FEE_CENTS } from "../src/lib/billing/auto-setup-pricing.ts";

const NOW = new Date("2026-08-20T12:00:00Z");
const paid = (over = {}) => ({
  accountType: "reseller",
  resellerActivatedAt: new Date("2026-01-10T00:00:00Z"),
  resellerExpiresAt: new Date("2027-01-10T00:00:00Z"),
  resellerQuotaUsed: 0,
  ...over,
});

test("l'arithmétique du pack tombe juste", () => {
  // 40 000 FCFA reversés en crédit = 400 SC ; 50 installations à 8 SC = 400 SC.
  // Si l'une des trois constantes bouge sans les autres, le revendeur paie un
  // pack qui ne couvre plus son quota — ou l'inverse.
  assert.equal(RESELLER_QUOTA * RESELLER_SETUP_FEE_CENTS, RESELLER_PACK_FCFA);
});

test("aucune remise sans paiement encaissé", () => {
  // Le cœur de la garantie : demander le statut à l'inscription ne l'ouvre pas.
  const demande = resellerState({ accountType: "reseller", resellerActivatedAt: null, resellerExpiresAt: null, resellerQuotaUsed: 0 }, NOW);
  assert.equal(demande.pendingPayment, true);
  assert.equal(demande.active, false);
  assert.equal(setupFeeCentsFor(demande, false, autoSetupFeeCentsFor), AUTO_SETUP_FEE_CENTS.hotspotOnly);
  assert.equal(setupFeeCentsFor(demande, true, autoSetupFeeCentsFor), AUTO_SETUP_FEE_CENTS.containerCapable);
});

test("un revendeur payé paie 800 FCFA, quel que soit le matériel", () => {
  // Le tarif public distingue conteneur (15 000) et hotspot seul (10 000) ;
  // le tarif revendeur est FORFAITAIRE.
  const s = resellerState(paid(), NOW);
  assert.equal(s.active, true);
  assert.equal(setupFeeCentsFor(s, false, autoSetupFeeCentsFor), RESELLER_SETUP_FEE_CENTS);
  assert.equal(setupFeeCentsFor(s, true, autoSetupFeeCentsFor), RESELLER_SETUP_FEE_CENTS);
});

test("le quota épuisé fait retomber au tarif public", () => {
  const s = resellerState(paid({ resellerQuotaUsed: RESELLER_QUOTA }), NOW);
  assert.equal(s.quotaLeft, 0);
  assert.equal(s.active, true, "le compte reste revendeur jusqu'à l'échéance");
  assert.equal(setupFeeCentsFor(s, true, autoSetupFeeCentsFor), AUTO_SETUP_FEE_CENTS.containerCapable);
});

test("la 50e installation est encore remisée, la 51e ne l'est plus", () => {
  // Erreur classique d'un compteur : décaler d'une unité et offrir 51 poses,
  // ou en refuser une qui était due.
  const avant = resellerState(paid({ resellerQuotaUsed: 49 }), NOW);
  assert.equal(avant.quotaLeft, 1);
  assert.equal(setupFeeCentsFor(avant, false, autoSetupFeeCentsFor), RESELLER_SETUP_FEE_CENTS);

  const apres = resellerState(paid({ resellerQuotaUsed: 50 }), NOW);
  assert.equal(apres.quotaLeft, 0);
  assert.equal(setupFeeCentsFor(apres, false, autoSetupFeeCentsFor), AUTO_SETUP_FEE_CENTS.hotspotOnly);
});

test("un pack expiré ne remise plus rien", () => {
  const s = resellerState(paid({ resellerExpiresAt: new Date("2026-08-19T00:00:00Z") }), NOW);
  assert.equal(s.expired, true);
  assert.equal(s.active, false);
  assert.equal(setupFeeCentsFor(s, false, autoSetupFeeCentsFor), AUTO_SETUP_FEE_CENTS.hotspotOnly);
});

test("un compte simple n'est jamais confondu avec un revendeur", () => {
  for (const row of [null, { accountType: "user", resellerActivatedAt: null, resellerExpiresAt: null, resellerQuotaUsed: 0 }]) {
    const s = resellerState(row, NOW);
    assert.equal(s.requested, false);
    assert.equal(s.active, false);
    assert.equal(s.pendingPayment, false, "un compte simple n'est pas « en attente de paiement »");
    assert.equal(setupFeeCentsFor(s, true, autoSetupFeeCentsFor), AUTO_SETUP_FEE_CENTS.containerCapable);
  }
});

test("un compteur incohérent ne crée pas de quota négatif ni infini", () => {
  // Une régression de comptage ne doit pas se transformer en remise illimitée.
  const trop = resellerState(paid({ resellerQuotaUsed: 999 }), NOW);
  assert.equal(trop.quotaLeft, 0);
  const negatif = resellerState(paid({ resellerQuotaUsed: -5 }), NOW);
  assert.equal(negatif.quotaUsed, 0);
  assert.equal(negatif.quotaLeft, RESELLER_QUOTA);
});

test("le pack court sur douze mois", () => {
  assert.equal(resellerExpiryFrom(new Date("2026-01-10T00:00:00Z")).toISOString().slice(0, 10), "2027-01-10");
  // Le 31 janvier + 12 mois doit rester une date valide, pas un 31 février.
  const bord = resellerExpiryFrom(new Date("2026-01-31T00:00:00Z"));
  assert.ok(!Number.isNaN(bord.getTime()));
});

import { readFile } from "node:fs/promises";
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("le quota ne se décompte que si le débit a réellement eu lieu", async () => {
  // appendSafecoinDebit est idempotent sur `auto-setup:<routerId>` : rejouer
  // la même installation renvoie created:false SANS débiter. Incrémenter sans
  // cette garde brûlerait une pose à chaque nouvel essai — le revendeur
  // perdrait des installations qu'il n'a jamais faites.
  const src = await read("src/lib/safecoin/service-charges.ts");
  assert.match(src, /if \(usedResellerRate && result\.created\)/);
  assert.match(src, /resellerQuotaUsed: sql`\$\{organizations\.resellerQuotaUsed\} \+ 1`/);
});

test("le prix ANNONCÉ est celui qui sera débité", async () => {
  // Sinon un revendeur lit 15 000 dans l'assistant, se voit refuser pour solde
  // insuffisant, et est en réalité facturé 800.
  const setup = await read("src/lib/mikrotik/container-setup.ts");
  assert.doesNotMatch(setup, /autoSetupFeeCentsFor\(/, "le devis doit passer par setupFeeFcfaFor");
  assert.match(setup, /setupFeeFcfaFor\(\{ supportsContainers, orgId: org\.id \}\)/);
});

test("sans organisation, c'est le tarif public — jamais la remise", async () => {
  // Les affichages génériques (landing, grille tarifaire) ne parlent d'aucun
  // compte : se tromper vers le tarif public ne lèse personne, l'inverse
  // offrirait la remise à tout le monde.
  const src = await read("src/lib/safecoin/service-charges.ts");
  assert.match(src, /if \(!opts\.orgId\) return autoSetupFeeCentsFor\(opts\.supportsContainers\);/);
  // Et un schéma en retard ne doit pas non plus ouvrir la remise.
  assert.match(src, /\.catch\(\(\) => \[\]\)/);
});
