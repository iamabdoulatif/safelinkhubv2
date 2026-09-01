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
      new URL("../../../deploy/mikhmon-v7/patch-modeles.php", import.meta.url),
      "utf8",
    );
    /* Le correctif est passé de sed à PHP : il remplace des BLOCS (un switch de
       dix lignes, une liste de règles CSS), que sed ne décrirait qu'avec des
       plages multi-lignes illisibles. Le contrôle, lui, est plus strict —
       chaque remplacement est COMPTÉ, là où un sed qui rate sort en 0. */
    assert.match(script, /\$nClean !== 1 \|\| \$nValue !== 1/, "le prix n'est pas recompté");
    assert.match(script, /\$nSwitch !== 1/, "le switch n'est pas recompté");
    assert.match(script, /\$nCss !== 1/, "le CSS n'est pas recompté");
    assert.match(script, /'\/ 100'\) !== false[\s\S]{0,120}exit\(1\)/, "la division n'est pas re-vérifiée");
  });

  it("les trois modèles sont corrigés, pas seulement celui qu'on a sous les yeux", async () => {
    // template.php, template-small.php et safetmp.php portaient la MÊME faute.
    const { readFile } = await import("node:fs/promises");
    const script = await readFile(
      new URL("../../../deploy/mikhmon-v7/patch-modeles.php", import.meta.url),
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

describe("d'où viennent les images", () => {
  it("les DEUX éditions viennent d'un registre que nous contrôlons", async () => {
    /* Un nom nu (`latif225/…`, `safelinkhub/…`) est résolu sur Docker Hub. Le
       jour où ce compte change de mains, le routeur lancerait l'image d'un
       inconnu AVEC SES PROPRES IDENTIFIANTS, écrits dans la session MikHmon. */
    for (const e of Object.values(MIKHMON_EDITIONS)) {
      assert.match(e.image, /^ghcr\.io\/iamabdoulatif\//, `${e.id} : registre non contrôlé`);
    }
  });

  it("l'auto-setup installe la MÊME image v7 que le sélecteur", async () => {
    /* Deux chemins d'installation qui divergent, c'est un parc où la moitié
       des routeurs imprime le bon prix et l'autre non. */
    const { readFile } = await import("node:fs/promises");
    const setup = await readFile(new URL("./container-setup.ts", import.meta.url), "utf8");
    const ligne = setup.match(/const REMOTE_IMAGE = "([^"]+)"/);
    assert.ok(ligne, "REMOTE_IMAGE introuvable");
    assert.equal(ligne![1], MIKHMON_EDITIONS.v7.image);

    /* Et le profil de référence AFFICHÉ à l'exploitant : il ne pilote rien,
       mais s'il annonce une autre image que celle réellement installée, il
       ment à qui vient vérifier. */
    const profil = await readFile(new URL("./router-setup-profile.ts", import.meta.url), "utf8");
    assert.ok(
      !profil.includes("latif225/"),
      "le profil de référence montre encore l'ancienne image",
    );
  });
});

describe("couleurs des tickets imprimés", () => {
  const palette = async () => {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL("../../../deploy/mikhmon-v7/couleurs-prix.php", import.meta.url), "utf8");
  };

  it("plus de douze prix, et aucune couleur en double", async () => {
    /* Deux prix de la même couleur, c'est une confusion au comptoir : le
       vendeur trie les tickets à l'œil, pas en lisant le montant. */
    const src = await palette();
    const lignes = [...src.matchAll(/^\s*(\d+)\s*=>\s*array\('(#[0-9A-F]{6})'/gm)];
    assert.ok(lignes.length > 12, `seulement ${lignes.length} prix`);
    const fonds = lignes.map((m) => m[2]);
    assert.equal(new Set(fonds).size, fonds.length, "deux prix partagent une couleur");
    const prix = lignes.map((m) => m[1]);
    assert.equal(new Set(prix).size, prix.length, "un prix apparaît deux fois");
  });

  it("aucun dégradé — que des aplats", async () => {
    /* L'amont en posait trois dans safetmp.php. Un dégradé s'imprime mal et
       mange l'encre : ces tickets sortent sur des imprimantes de comptoir. */
    const src = await palette();
    assert.ok(!/gradient/i.test(src), "un dégradé s'est glissé dans la palette");
    const patch = await (await import("node:fs/promises")).readFile(
      new URL("../../../deploy/mikhmon-v7/patch-modeles.php", import.meta.url),
      "utf8",
    );
    // Le bloc CSS amont est remplacé en entier, donc ses dégradés disparaissent.
    assert.match(patch, /slh_css_prix/);
  });

  it("le texte reste lisible sur les fonds clairs", async () => {
    /* Du blanc sur le jaune ou le lavande est illisible, et un ticket se lit
       sur papier, souvent mal imprimé. Chaque teinte porte donc sa couleur de
       texte plutôt qu'un blanc uniforme. */
    const src = await palette();
    for (const clair of ["#FFE119", "#42D4F4", "#BFEF45", "#FFD8B1", "#FABED4", "#DCBEFF"]) {
      const ligne = src.split("\n").find((l) => l.includes(clair));
      assert.ok(ligne?.includes("'fonce'"), `${clair} devrait porter un texte foncé`);
    }
  });

  it("la couleur et le prix ne peuvent plus diverger", async () => {
    /* La faute d'origine : une liste CSS déclarant .bg-800 pendant que le
       switch testait case 700. Les deux se lisent maintenant dans la MÊME
       table — le CSS est engendré, plus recopié. */
    const src = await palette();
    assert.match(src, /function slh_classe_prix/);
    assert.match(src, /function slh_css_prix/);
    assert.match(src, /slh_palette_prix\(\)/);
    // Aucune règle .bg- écrite à la main dans le fichier de palette.
    assert.ok(!/^\s*\.bg-\d+\s*\{/m.test(src), "une règle CSS est écrite en dur");
  });
});

describe("le format de l'image v7, tel que RouterOS sait le lire", () => {
  const workflow = async () => {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  };

  it("l'image est publiée en Docker v2, jamais en OCI", async () => {
    /* PANNE OBSERVÉE SUR HSPT-SAMASSA. RouterOS ne lit pas un manifeste OCI :
       il extrait les premières couches — assez pour que PHP démarre — et
       abandonne celles qui portent l'application. Le conteneur tourne en
       répondant 404 sur TOUTE URL, ce qui ne ressemble à aucune panne connue :
       ni conteneur arrêté, ni NAT manquant, ni tunnel coupé.

       buildx bascule en OCI dès qu'il joint une attestation, ce qu'il fait par
       défaut — d'où les trois réglages, qui vont ensemble. */
    const job = (await workflow()).slice((await workflow()).indexOf("mikhmon-v7:"));
    assert.match(job, /provenance: false/);
    assert.match(job, /sbom: false/);
    assert.match(job, /oci-mediatypes=false/);
  });

  it("la v6 n'a pas la même contrainte, et c'est expliqué", async () => {
    /* L'image v6 ne tourne QUE sur le relais, sous Docker, qui lit les deux
       formats. Lui imposer la même contrainte serait un culte du cargo. */
    const wf = await workflow();
    const v6 = wf.slice(wf.indexOf("mikhmon-v6:"), wf.indexOf("mikhmon-v7:"));
    assert.ok(!v6.includes("oci-mediatypes"), "contrainte inutile recopiée sur la v6");
  });
});
