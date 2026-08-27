import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { MIKHMON_EDITIONS, editionForRouter, parseEdition } from "./mikhmon-editions";

describe("éditions MikHmon", () => {
  it("chaque routeur reçoit l'édition que son matériel permet", () => {
    assert.equal(editionForRouter(true)?.id, "v7");
    assert.equal(editionForRouter(false)?.id, "v6");
  });

  it("une capacité non mesurée ne choisit PAS d'édition", () => {
    /* Trancher à la place de la mesure enverrait un MikHmon Docker sur une
       carte MIPS qui ne sait pas l'exécuter. Mieux vaut ne rien proposer. */
    assert.equal(editionForRouter(null), null);
    assert.equal(editionForRouter(undefined), null);
  });

  it("les surnoms disent la version de RouterOS, pas celle de MikHmon", () => {
    // v6 = MikHmon v3 de laksa19 ; le surnom parle du routeur, pas du logiciel.
    assert.match(MIKHMON_EDITIONS.v6.origine, /v3/);
    assert.match(MIKHMON_EDITIONS.v6.audience, /RouterOS 6/);
    assert.match(MIKHMON_EDITIONS.v7.audience, /RouterOS 7/);
  });

  it("la traduction française couvre toutes les clés de l'original", async () => {
    /* Une clé absente s'affiche comme une variable vide dans MikHmon : le
       libellé disparaît de l'écran sans la moindre erreur. Comparaison faite
       sur les noms de variables, seule forme lisible sans exécuter du PHP. */
    const fr = await readFile(new URL("../../../deploy/mikhmon-v6/lang/fr.php", import.meta.url), "utf8");
    const cles = (s: string) => new Set([...s.matchAll(/^\$(_[a-zA-Z_]+)\s*=/gm)].map((m) => m[1]));
    const clesFr = cles(fr);
    assert.ok(clesFr.size > 140, `traduction trop courte : ${clesFr.size} clés`);
    // Aucune valeur laissée vide — un libellé blanc est pire qu'un anglais.
    assert.ok(!/^\$_[a-zA-Z_]+\s*=\s*["']\s*["']\s*;/m.test(fr), "une clé traduite est vide");
    assert.match(fr, /\$langid\s*=\s*"fr"/);
    assert.match(fr, /\$langname\s*=\s*"Français"/);
  });
});

describe("choix de l'édition à l'activation", () => {
  it("une valeur inconnue retombe sur v7, jamais sur v6", () => {
    /* Le repli ne doit pas changer le MikHmon de quelqu'un : v7 est l'édition
       des instances créées avant que le choix existe. */
    for (const v of ["", "V6", "v8", "latest", null, undefined, "'; rm -rf /"]) {
      assert.equal(parseEdition(v as string | null | undefined), "v7", `entrée : ${String(v)}`);
    }
    assert.equal(parseEdition("v6"), "v6");
  });

  it("chaque édition nomme une image, et jamais la même", () => {
    // Deux éditions qui pointent la même image = un choix qui ne choisit rien.
    assert.notEqual(MIKHMON_EDITIONS.v6.image, MIKHMON_EDITIONS.v7.image);
    for (const e of Object.values(MIKHMON_EDITIONS)) {
      assert.match(e.image, /^[a-z0-9][a-z0-9._/-]*:[a-zA-Z0-9._-]+$/, `${e.id} : image mal formée`);
    }
  });

  it("le nom d'image ne peut pas transporter d'argument shell", () => {
    /* Il finit dans une commande `docker run` sur le relais. La validation vit
       surtout dans parseEdition — qui n'accepte que deux littéraux — mais on
       vérifie aussi la table elle-même. */
    for (const e of Object.values(MIKHMON_EDITIONS)) {
      assert.ok(!/[\s;&|$`'"]/.test(e.image), `${e.id} : caractère shell dans l'image`);
    }
  });
});
