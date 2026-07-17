import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUserComment,
  commentBody,
  dateToWall,
  formatExpiryComment,
  parseExpiryComment,
  wallToDate,
  type Wall,
} from "./reconcile";

const EXPIRY: Wall = { y: 2026, mon: 6, d: 18, h: 14, mi: 0, s: 28 }; // jul/18/2026 14:00:28
const START: Wall = { y: 2026, mon: 6, d: 17, h: 14, mi: 0, s: 28 }; // jul/17/2026 14:00:28

/**
 * Le commentaire d'un ticket est lu par TROIS consommateurs aux exigences
 * incompatibles avec l'improvisation : le sweep RouterOS (positions figées
 * 0→20), MikHmon (0-20 = « Expired », 21+ = « Comment »), et parseExpiryComment
 * ici. Ces tests verrouillent le contrat commun.
 */
describe("commentaire de ticket : expiration + date de début", () => {
  it("place le début exactement au caractère 21, là où MikHmon lit son champ libre", () => {
    const c = buildUserComment(EXPIRY, START, "");
    assert.equal(c.slice(0, 20), "jul/18/2026 14:00:28"); // champ « Expired » de MikHmon
    assert.equal(c[20], " "); // séparateur
    assert.equal(c.slice(21), "debut jul/17/2026 14:00:28"); // champ « Comment »
  });

  it("reste lisible par le sweep : l'expiration se relit à l'identique", () => {
    const c = buildUserComment(EXPIRY, START, "");
    assert.deepEqual(parseExpiryComment(c), EXPIRY);
  });

  /**
   * Le décompte tourne toutes les 2 min sur tout le parc. Un format non
   * stable ferait réécrire les MÊMES tickets à chaque passage — écriture
   * RouterOS inutile en boucle sur chaque routeur.
   */
  it("est idempotent — repasser dessus ne produit aucune réécriture", () => {
    const once = buildUserComment(EXPIRY, START, "");
    const twice = buildUserComment(EXPIRY, START, once);
    assert.equal(twice, once);
  });

  it("réécrit notre propre début quand l'expiration a bougé", () => {
    const stale = buildUserComment({ ...EXPIRY, d: 19 }, { ...START, d: 18 }, "");
    const fresh = buildUserComment(EXPIRY, START, stale);
    assert.equal(fresh, "jul/18/2026 14:00:28 debut jul/17/2026 14:00:28");
  });

  /**
   * Un admin peut saisir une note dans le champ « Comment » de MikHmon. La
   * version précédente de ce module réécrivait les 20 caractères d'expiration
   * SEULS, ce qui effaçait sa note sans le dire.
   */
  it("ne piétine pas la note d'un admin — elle est préservée", () => {
    const c = buildUserComment(EXPIRY, START, "jul/18/2026 14:00:28 vendu par Ali");
    assert.equal(c, "jul/18/2026 14:00:28 vendu par Ali");
  });

  it("préserve la note même quand l'expiration doit être corrigée", () => {
    const c = buildUserComment(EXPIRY, START, "jul/01/2026 09:00:00 vendu par Ali");
    assert.equal(c, "jul/18/2026 14:00:28 vendu par Ali");
  });

  it("sans durée exploitable, écrit l'expiration seule plutôt que d'inventer un début", () => {
    assert.equal(buildUserComment(EXPIRY, null, ""), "jul/18/2026 14:00:28");
  });

  it("sans début, garde quand même la note de l'admin", () => {
    const c = buildUserComment(EXPIRY, null, "jul/01/2026 09:00:00 vendu par Ali");
    assert.equal(c, "jul/18/2026 14:00:28 vendu par Ali");
  });

  it("un commentaire vierge (ticket jamais connecté) n'a pas de champ libre", () => {
    assert.equal(commentBody(""), "");
    assert.equal(commentBody("jul/18/2026 14:00:28"), "");
  });
});

describe("dateToWall / wallToDate", () => {
  it("fait l'aller-retour sans dériver", () => {
    assert.deepEqual(dateToWall(wallToDate(EXPIRY)), EXPIRY);
  });

  /** Le début se DÉDUIT de l'expiration moins la durée — il doit tomber juste. */
  it("un jour avant l'expiration donne bien la date de début attendue", () => {
    const start = new Date(wallToDate(EXPIRY).getTime() - 86_400_000);
    assert.equal(formatExpiryComment(dateToWall(start)), "jul/17/2026 14:00:28");
  });
});
