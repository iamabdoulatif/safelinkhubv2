import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consequenceDe, nomConfirme } from "./action-destructive";

describe("ce que la confirmation annonce", () => {
  it("les deux actions ne racontent PAS la même chose", () => {
    /* C'était le défaut : un libellé laconique quasi identique pour retirer une
       ligne et pour effacer un routeur. */
    const r = consequenceDe("reset", "HSPT-ADJA");
    const d = consequenceDe("delete", "HSPT-ADJA");
    assert.notEqual(r.titre, d.titre);
    assert.notEqual(r.bouton, d.bouton);
    assert.notDeepEqual(r.effets, d.effets);
  });

  it("l'effacement d'usine dit qu'il efface la configuration", () => {
    const r = consequenceDe("reset", "HSPT-ADJA");
    assert.match(r.effets.join(" "), /effacée|effacement/i);
    assert.match(r.effets.join(" "), /redémarre|redevient/i);
  });

  it("le retrait dit que l'APPAREIL n'est pas touché", () => {
    /* La confusion la plus coûteuse : croire que « Supprimer » coupe le WiFi
       des clients. Il faut le démentir dans le dialogue, pas après. */
    const d = consequenceDe("delete", "HSPT-ADJA");
    assert.match(d.resume, /n'est pas touché/i);
    assert.match(d.conserve.join(" "), /reste EN PLACE|continuent/i);
  });

  it("chaque action nomme le routeur visé", () => {
    // On confirme depuis une LIGNE parmi d'autres : le dialogue doit dire
    // laquelle, sinon la confirmation ne confirme rien.
    for (const a of ["reset", "delete"] as const) {
      assert.match(consequenceDe(a, "HSPT-WIFIRAPIDE").resume, /HSPT-WIFIRAPIDE/);
    }
  });

  it("seul l'effacement exige de recopier le nom", () => {
    /* C'est la seule action que rien ne rattrape — aucune sauvegarde
       SafeLinkHub ne remonte une configuration RouterOS effacée. Le retrait,
       lui, se répare en reliant le routeur à nouveau. */
    assert.equal(consequenceDe("reset", "X").exigeLeNom, true);
    assert.equal(consequenceDe("delete", "X").exigeLeNom, false);
  });

  it("chaque action dit aussi ce qui SURVIT", () => {
    // Une liste qui ne montre que des pertes fait renoncer à une action sûre.
    for (const a of ["reset", "delete"] as const) {
      assert.ok(consequenceDe(a, "X").conserve.length > 0);
    }
  });
});

describe("la recopie du nom", () => {
  it("accepte la casse et les espaces de bord", () => {
    // On écarte la faute de frappe, pas la patience de l'exploitant.
    assert.equal(nomConfirme("  hspt-adja ", "HSPT-ADJA"), true);
  });

  it("refuse un nom voisin", () => {
    /* Deux routeurs d'un même site portent souvent des noms proches — c'est
       exactement le cas où l'on efface le mauvais. */
    assert.equal(nomConfirme("HSPT-ADJA2", "HSPT-ADJA"), false);
    assert.equal(nomConfirme("HSPT-ADJ", "HSPT-ADJA"), false);
    assert.equal(nomConfirme("", "HSPT-ADJA"), false);
  });
});
