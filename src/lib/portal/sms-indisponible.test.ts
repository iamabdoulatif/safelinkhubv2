import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

/**
 * SMS impossible : la vente doit continuer.
 *
 * DEUX causes, un seul comportement :
 *   • le crédit SMS du point de vente est épuisé (ou l'API en panne) ;
 *   • l'opérateur a DÉCOCHÉ la passerelle dans ses réglages — il vend
 *     sciemment sans vérification par SMS.
 *
 * Le serveur marque le numéro vérifié et répond `sms_unavailable` dans les
 * deux cas : une vérification impossible ne protège personne, une vente
 * perdue coûte tout de suite, et refuser la vente à qui a coupé le SMS exprès
 * serait lui désobéir. Encore faut-il que CHAQUE client sache lire ce statut :
 * celui qui l'ignore le fait tomber dans son cas d'erreur et bloque
 * l'acheteur, alors que le serveur venait de le laisser passer.
 */
const lire = (chemin: string) => readFile(new URL(chemin, import.meta.url), "utf8");

describe("crédit SMS épuisé", () => {
  it("le serveur ouvre la voie au lieu de refuser la vente", async () => {
    const src = await lire("../../app/api/portal/[slug]/otp/send/route.ts");
    const bloc = src.slice(src.indexOf("if (!sms.ok)"));
    // Le numéro est marqué vérifié : sans cela, /initiate refuserait le paiement.
    assert.match(bloc, /verifiedAt: new Date\(now\)/, "le numéro n'est pas débloqué");
    assert.match(bloc, /status: "sms_unavailable"/);
    /* Et AUCUNE sortie en 400 : une passerelle décochée ne bloque plus la
       vente. C'était l'ancienne règle ; elle punissait l'opérateur qui avait
       volontairement coupé le SMS. */
    assert.doesNotMatch(bloc, /status: 400/);
  });

  it("le SMS du ticket ne s'obstine pas quand la passerelle est décochée", async () => {
    /* Sans cette sortie, chaque commande ouvrait une tentative d'envoi,
       s'inscrivait en « échec » et repassait devant le cron de reprise toutes
       les minutes — un journal d'erreurs pour un envoi délibérément coupé. */
    const src = await lire("../portal/fulfill.ts");
    const bloc = src.slice(src.indexOf("async function trySendPortalSms"));
    assert.match(bloc.slice(0, 900), /isOrgSmsEnabled\(order\.orgId\)/);
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
