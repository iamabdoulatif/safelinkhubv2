import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

/**
 * Crédit SMS épuisé : la vente doit continuer.
 *
 * Le serveur tranche déjà — il marque le numéro vérifié et répond
 * `sms_unavailable`, parce qu'une vérification impossible ne protège personne
 * et qu'une vente perdue, si. Encore faut-il que CHAQUE client sache lire ce
 * statut : celui qui l'ignore le fait tomber dans son cas d'erreur et bloque
 * l'acheteur, alors que le serveur venait de le laisser passer. C'est
 * exactement ce qui arrivait à la page /portal/purchase.
 */
const lire = (chemin: string) => readFile(new URL(chemin, import.meta.url), "utf8");

describe("crédit SMS épuisé", () => {
  it("le serveur ouvre la voie au lieu de refuser la vente", async () => {
    const src = await lire("../../app/api/portal/[slug]/otp/send/route.ts");
    const bloc = src.slice(src.indexOf("if (!sms.ok)"));
    // Le numéro est marqué vérifié : sans cela, /initiate refuserait le paiement.
    assert.match(bloc, /verifiedAt: new Date\(now\)/, "le numéro n'est pas débloqué");
    assert.match(bloc, /status: "sms_unavailable"/);
    /* Une passerelle NON CONFIGURÉE reste bloquante, elle : c'est une org qui
       n'a jamais mis de SMS en place, pas un crédit tombé à zéro. */
    assert.match(bloc, /sms\.notConfigured[\s\S]{0,200}status: 400/);
  });

  it("les DEUX clients savent lire ce statut", async () => {
    for (const [nom, chemin] of [
      ["portail captif (installé sur les routeurs)", "../captive-templates/package-files.ts"],
      ["page d'achat web", "../../app/portal/purchase/PurchaseFlow.tsx"],
    ] as const) {
      const src = await lire(chemin);
      assert.ok(src.includes("sms_unavailable"), `${nom} : statut ignoré, l'acheteur serait bloqué`);
    }
  });

  it("la page d'achat va au paiement, elle ne se contente pas d'un message", async () => {
    /* Reconnaître le statut sans enchaîner sur le paiement laisserait
       l'acheteur devant un écran poli et immobile. */
    const src = await lire("../../app/portal/purchase/PurchaseFlow.tsx");
    const bloc = src.slice(src.indexOf('data.status === "sms_unavailable"'));
    assert.match(bloc.slice(0, 600), /initiatePurchase\(\)/);
  });
});
