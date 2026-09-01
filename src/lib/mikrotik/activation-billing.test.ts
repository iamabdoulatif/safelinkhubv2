import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { messageSoldeInsuffisant, verdictDebitWallet } from "./activation-billing";

describe("débit du portefeuille à l'activation", () => {
  it("un portefeuille vide ne paie pas l'activation", () => {
    // C'était la faille : la ligne de charge s'écrivait sans regarder le solde.
    const v = verdictDebitWallet(0, 5000);
    assert.equal(v.ok, false);
    assert.equal(v.ok === false && v.manqueCents, 5000);
  });

  it("un solde NÉGATIF augmente d'autant ce qu'il faut recharger", () => {
    /* Un portefeuille déjà à découvert doit rembourser sa dette EN PLUS du
       prix — sinon le montant annoncé à l'exploitant est faux. */
    const v = verdictDebitWallet(-2000, 5000);
    assert.equal(v.ok === false && v.manqueCents, 7000);
  });

  it("un solde exactement égal au prix passe", () => {
    // Refuser le dernier franc à qui vient de recharger au centime près
    // n'aurait aucun sens.
    assert.equal(verdictDebitWallet(5000, 5000).ok, true);
    assert.equal(verdictDebitWallet(5001, 5000).ok, true);
  });

  it("le message dit ce qu'il MANQUE, et les deux façons de payer", () => {
    const m = messageSoldeInsuffisant(7000);
    /* Le séparateur de milliers de `fr-FR` est une espace fine INSÉCABLE
       (U+202F), pas une espace ordinaire — un motif qui l'ignore casse sans
       que rien ne soit faux côté produit. */
    assert.match(m, /7\s000 FCFA/u);
    assert.match(m, /[Rr]echargez/);
    assert.match(m, /en ligne/);
  });
});

describe("aucun accès ouvert sans paiement", () => {
  const source = () => readFile(new URL("./port-forward.ts", import.meta.url), "utf8");

  it("le solde est lu AVANT d'écrire la charge", async () => {
    const s = await source();
    const bloc = s.slice(s.indexOf("const solde = await getWalletBalanceCents"));
    const verdict = bloc.indexOf("verdictDebitWallet");
    const charge = bloc.indexOf("chargeWalletForActivation({");
    assert.ok(verdict > 0 && verdict < charge, "la charge s'écrit avant le contrôle");
  });

  it("la redirection est ANNULÉE quand le solde ne suffit pas", async () => {
    /* Sans ce retour en arrière, l'exploitant garde un accès public ouvert que
       personne n'a payé — exactement ce que la voie Safecoin évite déjà. */
    const s = await source();
    const bloc = s.slice(
      s.indexOf("const solde = await getWalletBalanceCents"),
      s.indexOf("await chargeWalletForActivation({"),
    );
    assert.match(bloc, /disablePortForward\(result\.forwardId\)/);
    assert.match(bloc, /return \{ error: messageSoldeInsuffisant/);
  });

  it("les deux voies de paiement traitent l'échec pareil", async () => {
    /* Safecoin annulait déjà ; le portefeuille FCFA ne le faisait pas. Deux
       comportements opposés pour un même geste selon l'ancienneté de
       l'organisation, c'est la vraie anomalie. */
    const s = await source();
    const occurrences = [...s.matchAll(/await disablePortForward\(result\.forwardId\);/g)];
    assert.ok(occurrences.length >= 2, `une seule voie annule (${occurrences.length})`);
  });
});
