import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { decideKycGate, KYC_THRESHOLD_FCFA } from "./gate";

const SEUIL = KYC_THRESHOLD_FCFA;

describe("porte KYC sur les rechargements", () => {
  it("laisse passer tant que le cumul reste sous le seuil", () => {
    const d = decideKycGate({ cumulPrecedentFcfa: 0, montantFcfa: SEUIL - 1, kycStatus: null });
    assert.equal(d.ok, true);
  });

  it("laisse passer le cumul EXACTEMENT au seuil", () => {
    // « Au-delà de 100 000 » : 100 000 pile n'est pas au-delà.
    const d = decideKycGate({ cumulPrecedentFcfa: 0, montantFcfa: SEUIL, kycStatus: null });
    assert.equal(d.ok, true);
  });

  it("compte le dépôt EN COURS dans le cumul", () => {
    /* Sinon la transaction qui franchit le seuil passerait toujours, et le
       blocage n'arriverait qu'au dépôt suivant : un seuil qu'on dépasse une
       fois gratuitement n'en est pas un. */
    const d = decideKycGate({ cumulPrecedentFcfa: SEUIL - 1, montantFcfa: 2, kycStatus: null });
    assert.equal(d.ok, false);
  });

  it("n'ouvre que sur un dossier VALIDÉ", () => {
    const bloquants = [null, "not_started", "documents_sent", "under_review", "rejected"];
    for (const kycStatus of bloquants) {
      const d = decideKycGate({ cumulPrecedentFcfa: SEUIL, montantFcfa: 1, kycStatus });
      assert.equal(d.ok, false, `${kycStatus} ne doit pas ouvrir la porte`);
    }
    const valide = decideKycGate({
      cumulPrecedentFcfa: SEUIL,
      montantFcfa: 1_000_000,
      kycStatus: "approved",
    });
    assert.equal(valide.ok, true);
  });

  it("dit à l'opérateur où il en est plutôt que « refusé »", () => {
    const enExamen = decideKycGate({
      cumulPrecedentFcfa: SEUIL,
      montantFcfa: 1,
      kycStatus: "under_review",
    });
    assert.equal(enExamen.ok, false);
    assert.match(enExamen.ok === false ? enExamen.message : "", /en cours d'examen/);

    const jamaisCommence = decideKycGate({
      cumulPrecedentFcfa: SEUIL,
      montantFcfa: 1,
      kycStatus: null,
    });
    assert.match(jamaisCommence.ok === false ? jamaisCommence.message : "", /Vérification/);
    // Le seuil est NOMMÉ : un refus sans chiffre est incompréhensible.
    assert.match(
      jamaisCommence.ok === false ? jamaisCommence.message : "",
      new RegExp(SEUIL.toLocaleString("fr-FR").replace(/\s/g, "\\s")),
    );
  });
});

describe("tous les chemins qui créditent le portefeuille passent la porte", () => {
  it("dépôt manuel, dépôt en ligne et édition de transaction", async () => {
    /* Trois écritures peuvent produire un rechargement confirmé. En garder une
       seule non gardée suffit à contourner le seuil : créer un dépôt de
       200 FCFA puis l'éditer en 5 000 000. */
    const src = await readFile(new URL("../wallet/actions.ts", import.meta.url), "utf8");
    const bloc = (nom: string) => {
      const debut = src.indexOf(`export async function ${nom}`);
      assert.ok(debut > 0, `fonction introuvable : ${nom}`);
      const suite = src.indexOf("\nexport ", debut + 1);
      return src.slice(debut, suite === -1 ? undefined : suite);
    };
    for (const nom of ["addWalletFunds", "startWalletTopupPayment", "updateWalletTransaction"]) {
      assert.match(bloc(nom), /kycTopupGate\(/, `${nom} doit passer la porte KYC`);
    }
    // Et le dépôt en ligne se ferme AVANT d'ouvrir un paiement chez GeniusPay.
    const enLigne = bloc("startWalletTopupPayment");
    assert.ok(
      enLigne.indexOf("kycTopupGate(") < enLigne.indexOf("createPlatformV3Payment("),
      "la porte doit précéder la création du paiement",
    );
  });
});
