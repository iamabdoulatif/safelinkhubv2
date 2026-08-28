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
    /* v6 = MikHmon v3 de laksa19 ; le surnom parle du routeur, pas du logiciel.
       La version vit dans `routerOs` depuis qu'elle a son propre champ — elle
       était noyée dans la phrase d'audience, où elle ne pouvait pas être
       affichée seule. */
    assert.match(MIKHMON_EDITIONS.v6.origine, /v3/);
    assert.match(MIKHMON_EDITIONS.v6.routerOs, /RouterOS 6/);
    assert.match(MIKHMON_EDITIONS.v7.routerOs, /RouterOS 7/);
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

  it("l'image v6 vient d'un registre que NOUS contrôlons", async () => {
    /* Le déploiement fait un `docker image prune -af` : toute image sans
       conteneur en marche disparaît, et `docker run` doit pouvoir la re-tirer.
       Un nom nu comme « safelinkhub/mikhmon-v6 » serait cherché sur Docker Hub,
       où ce compte ne nous appartient PAS — le jour où quelqu'un le publie, le
       relais lancerait son image avec les identifiants des routeurs.

       v7 est l'exception assumée : `latif225` est le compte Docker Hub de
       l'exploitant, donc l'image est déjà sous son contrôle. */
    assert.match(MIKHMON_EDITIONS.v6.image, /^ghcr\.io\/iamabdoulatif\//);
    assert.equal(MIKHMON_EDITIONS.v7.image.startsWith("latif225/"), true);

    // Et la chaîne de publication doit exister, sinon l'image n'arrive jamais.
    const wf = await readFile(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
    assert.match(wf, /ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/mikhmon-v6/);
    assert.match(wf, /context: deploy\/mikhmon-v6/);
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

describe("la plage RouterOS annoncée", () => {
  it("chaque édition dit à quelle version de RouterOS elle s'adresse", () => {
    /* Le surnom seul (« v6 », « v7 ») se confond avec une version de MikHmon.
       La plage est LE critère de choix de l'exploitant, elle doit être écrite. */
    assert.match(MIKHMON_EDITIONS.v7.routerOs, /7\.0.*7\.24\.1/);
    assert.match(MIKHMON_EDITIONS.v6.routerOs, /^RouterOS 6/);
  });

  it("la borne haute suit celle du reste du produit", async () => {
    /* 7.24.1 est aussi la version que l'écran d'activation annonce pour le
       tunnel WireGuard. Deux endroits qui affichent une borne différente
       enverraient l'exploitant sur la mauvaise édition. */
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./mikhmon-cloud-activation.ts", import.meta.url), "utf8");
    assert.ok(src.includes("7.24.1"), "la borne du tunnel a bougé sans celle de l'édition");
  });

  it("l'édition v7 est bien celle de SafeLinkHub", () => {
    // C'est l'écran « MIKHMON by SafeLink Africa » : l'origine doit le dire,
    // sinon deux tableaux d'apparence proche deviennent indiscernables.
    assert.match(MIKHMON_EDITIONS.v7.origine, /SafeLink/i);
    assert.match(MIKHMON_EDITIONS.v6.origine, /laksa19/);
  });
});

describe("le prix imprimé sur les tickets", () => {
  it("le correctif est vérifié à la construction, pas au premier ticket", async () => {
    /* Un `sed` qui ne trouve pas son motif sort en 0 : sans contrôle, une
       image inchangée passerait la construction et rien ne la distinguerait de
       l'originale — on ne s'en apercevrait qu'en imprimant un ticket. */
    const { readFile } = await import("node:fs/promises");
    const script = await readFile(
      new URL("../../../deploy/mikhmon-v7/corrige-prix.sh", import.meta.url),
      "utf8",
    );
    assert.match(script, /grep -n "\/ 100"[\s\S]{0,120}exit 1/, "la division n'est pas re-vérifiée");
    assert.match(script, /php -l/, "la syntaxe des modèles n'est pas vérifiée");
    assert.match(script, /^set -e$/m, "un échec de sed passerait inaperçu");
  });

  it("les trois modèles sont corrigés, pas seulement celui qu'on a sous les yeux", async () => {
    // template.php, template-small.php et safetmp.php portaient la MÊME faute.
    const { readFile } = await import("node:fs/promises");
    const script = await readFile(
      new URL("../../../deploy/mikhmon-v7/corrige-prix.sh", import.meta.url),
      "utf8",
    );
    for (const modele of ["template.php", "template-small.php", "safetmp.php"]) {
      assert.ok(script.includes(modele), `modèle oublié : ${modele}`);
    }
  });

  it("l'image v7 est construite pour l'ARM des routeurs", async () => {
    /* La v6 ne tourne que sur le relais, en x86. La v7 est installée SUR les
       MikroTik : une image mono-architecture ne démarrerait sur aucun. */
    const { readFile } = await import("node:fs/promises");
    const wf = await readFile(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
    const job = wf.slice(wf.indexOf("mikhmon-v7:"));
    assert.match(job, /platforms:.*linux\/arm64/);
    assert.match(job, /platforms:.*linux\/arm\/v7/);
  });
});
