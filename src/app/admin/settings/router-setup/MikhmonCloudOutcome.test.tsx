import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

const lire = (p: string) => readFile(new URL(`../../../../../${p}`, import.meta.url), "utf8");

describe("aboutissement MikHmon des cartes sans conteneur", () => {
  it("n'apparaît QUE pour une carte sans conteneur, et après un auto-setup réussi", async () => {
    /* Le proposer sur un hAP ax³ n'aurait aucun sens : son MikHmon tourne sur
       le routeur. Le proposer avant la réussite non plus : le tunnel dont
       dépend l'instance n'est pas encore monté. */
    const step = await lire("src/app/admin/settings/router-setup/AutoSetupStep.tsx");
    assert.match(
      step,
      /\{result\?\.success && !archSupportsContainers && \(\s*<MikhmonCloudOutcome routerId=\{routerId\} \/>/,
    );
  });

  it("passe par la porte facturée, sans la contourner ni la dupliquer", async () => {
    const vue = await lire("src/app/admin/settings/router-setup/MikhmonCloudOutcome.tsx");

    // La même action que l'écran Accès distant : l'accès MikHmon est un
    // service facturé et sous autorisation.
    assert.match(vue, /enablePortForward\(routerId, "mikhmon", "monthly"\)/);

    // Une garde qui réclame une autorisation renvoie vers l'écran qui sait la
    // traiter — on ne recopie pas son paywall ici, deux copies divergeraient.
    assert.match(vue, /needsAuthorization/);
    assert.match(vue, /href="\/admin\/remote-access"/);

    // Et l'on n'annonce jamais un succès sans domaine à montrer.
    assert.match(vue, /aucun domaine dédié n'a été renvoyé/);
  });
});
