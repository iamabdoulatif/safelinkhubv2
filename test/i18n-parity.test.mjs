import test from "node:test";
import assert from "node:assert/strict";
import { fr } from "../src/lib/i18n/fr.ts";
import { en } from "../src/lib/i18n/en.ts";

/** Toutes les clés, en notation pointée, y compris dans les tableaux d'objets. */
function cles(obj, prefixe = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const chemin = prefixe ? `${prefixe}.${k}` : k;
    if (Array.isArray(v)) {
      out.push(`${chemin}[]`);
      v.forEach((el, i) => {
        if (el && typeof el === "object") out.push(...cles(el, `${chemin}[${i}]`));
      });
    } else if (v && typeof v === "object") {
      out.push(...cles(v, chemin));
    } else {
      out.push(`${chemin}:${typeof v}`);
    }
  }
  return out.sort();
}

test("les deux dictionnaires ont exactement les mêmes clés", () => {
  // Le typage l'impose déjà à la compilation ; ce test attrape le cas où
  // quelqu'un contournerait le type (any, cast) et couvre aussi la longueur
  // des tableaux, que le type ne fixe pas.
  const a = cles(fr), b = cles(en);
  const manquantes = a.filter((k) => !b.includes(k));
  const enTrop = b.filter((k) => !a.includes(k));
  assert.deepEqual(manquantes, [], "clés absentes de en.ts");
  assert.deepEqual(enTrop, [], "clés en trop dans en.ts");
});

test("aucune chaîne française n'est restée dans l'anglais", () => {
  // Le typage ne peut PAS voir ça : « Fonctionnalités » est une string valide.
  // On traque les mots-outils français, qui ne peuvent pas apparaître par
  // hasard dans une phrase anglaise.
  const pieges = [
    " le ", " la ", " les ", " des ", " une ", " vous ", " votre ", " vos ",
    " pour ", " sans ", " avec ", " dans ", " est ", " sont ", " qui ", " que ",
    " du ", " au ", " aux ", " ses ", " leur ", " chaque ", " tout ", " plus de ",
  ];
  const fautes = [];
  const parcours = (v, chemin) => {
    if (typeof v === "function") {
      // On exécute avec des valeurs neutres pour lire le texte produit.
      try { v = v(1, "1", "1"); } catch { return; }
    }
    if (typeof v === "string") {
      const t = ` ${v.toLowerCase()} `;
      for (const p of pieges) if (t.includes(p)) fautes.push(`${chemin} → « ${v} »`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((el, i) => parcours(el, `${chemin}[${i}]`));
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v)) parcours(val, `${chemin}.${k}`);
    }
  };
  parcours(en, "en");
  assert.deepEqual(fautes, [], "chaînes restées en français :\n" + fautes.join("\n"));
});

test("le français, lui, contient bien du français", () => {
  // Garde-fou du test précédent : s'il ne détectait plus rien, il passerait
  // pour de bonnes ET de mauvaises raisons.
  const t = JSON.stringify(fr).toLowerCase();
  assert.ok(t.includes(" votre ") || t.includes(" vos "), "le détecteur doit savoir repérer du français");
});

test("le contenu traduit s'aligne sur la structure de content.ts", async () => {
  // La structure (icône, largeur de colonne) reste dans content.ts, le texte
  // vit dans les dictionnaires, et les deux sont appariés PAR INDEX. Un
  // décalage d'un cran collerait la mauvaise icône au bon titre sans rien
  // casser visiblement — c'est exactement le genre de bug qu'on ne voit pas.
  const c = await import("../src/components/landing/content.ts");
  const paires = [
    ["painPoints", c.painPoints],
    ["quickFeatures", c.quickFeatures],
    ["processSteps", c.processSteps],
    ["platformFeatures", c.platformFeatures],
    ["hardware", c.hardware],
    ["faqs", c.faqs],
  ];
  for (const [nom, structure] of paires) {
    assert.equal(fr.content[nom].length, structure.length, `fr.content.${nom}`);
    assert.equal(en.content[nom].length, structure.length, `en.content.${nom}`);
  }
});

test("les noms de marque ne sont pas traduits", async () => {
  // « MikroTik » traduit en « MicroTik » ou « Safecoin » en « Safecoin »
  // francisé casserait la reconnaissance produit et le référencement.
  // On lit la SOURCE, pas JSON.stringify(en) : plusieurs chaînes vivent dans
  // des fonctions d'interpolation, que la sérialisation supprime purement et
  // simplement — le test passait alors sans rien vérifier.
  const { readFile } = await import("node:fs/promises");
  // Commentaires RETIRÉS : le premier jet cherchait « WinBox », qui
  // n'apparaissait que dans l'en-tête explicatif du fichier. Le test passait
  // donc sans rien garantir sur les chaînes réellement affichées.
  const brut = await readFile(new URL("../src/lib/i18n/en.ts", import.meta.url), "utf8");
  const texte = brut.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const marque of ["MikroTik", "Safecoin", "SafeLinkHub", "Orange Money", "MTN MoMo", "Wave", "Moov Money", "RADIUS", "PPPoE", "WinBox", "WebFig", "MikHmon"]) {
    assert.ok(texte.includes(marque), `« ${marque} » doit rester tel quel en anglais`);
  }
  // Et les montants restent en FCFA dans les deux langues.
  assert.ok(texte.includes("FCFA"));
});

test("chaque période et chaque service facturé a son libellé dans les deux langues", async () => {
  // Les ids viennent de la config de facturation, les libellés du dictionnaire.
  // Ajouter une période sans la traduire afficherait « undefined » dans la
  // grille de prix — le typage ne peut pas le voir, les clés du dictionnaire
  // n'étant pas dérivées de la config.
  const { BILLING_PERIODS, REMOTE_ACCESS_SERVICES } = await import(
    "../src/lib/billing/remote-access-gate-config.ts"
  );
  for (const [lang, d] of [["fr", fr], ["en", en]]) {
    for (const p of BILLING_PERIODS) {
      assert.ok(d.pricing.periods[p.id], `${lang}.pricing.periods.${p.id} manquant`);
    }
    for (const sv of REMOTE_ACCESS_SERVICES) {
      assert.ok(d.pricing.services[sv.id], `${lang}.pricing.services.${sv.id} manquant`);
    }
  }
  // Et les périodes sont bien traduites, pas recopiées.
  assert.notDeepEqual(
    Object.values(fr.pricing.periods),
    Object.values(en.pricing.periods),
    "les périodes anglaises sont restées en français",
  );
});

test("le sélecteur renvoie vers l'équivalent de la page, pas vers l'accueil", async () => {
  const { switchLocalePath } = await import("../src/lib/i18n/config.ts");
  assert.equal(switchLocalePath("/", "en"), "/en");
  assert.equal(switchLocalePath("/en", "fr"), "/");
  // Depuis une page interne : on reste sur la même page.
  assert.equal(switchLocalePath("/contact", "en"), "/en/contact");
  assert.equal(switchLocalePath("/en/contact", "fr"), "/contact");
  // Et « /english » ne doit pas être confondu avec le préfixe « /en ».
  assert.equal(switchLocalePath("/english", "fr"), "/english");
});

test("le sélecteur de langue ne peut pas produire de 404", async () => {
  /* Le bug qui a atteint la production : `localeHref` vérifiait qu'une page
     existait en anglais, `switchLocalePath` ne le faisait pas. Depuis
     /contact, le sélecteur pointait vers /en/contact — page inexistante.
     Les tests d'alors ne couvraient que `localeHref` ; l'un affirmait même
     l'URL cassée comme résultat attendu.

     Ici la vérité vient du DISQUE : on liste les pages réelles, et pour
     chacune la cible du sélecteur doit exister. Ajouter une page sans la
     traduire ne peut donc plus fabriquer de lien mort. */
  const { readdir } = await import("node:fs/promises");
  const { switchLocalePath } = await import("../src/lib/i18n/config.ts");
  const appDir = new URL("../src/app/", import.meta.url);

  const pages = async (base, prefixe = "") => {
    const out = [];
    for (const e of await readdir(base, { withFileTypes: true })) {
      if (e.name === "page.tsx") out.push(prefixe || "/");
      else if (e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("(")) {
        out.push(...(await pages(new URL(`${e.name}/`, base), `${prefixe}/${e.name}`)));
      }
    }
    return out;
  };

  const toutes = await pages(appDir);
  /* Pages PUBLIQUES seulement : /admin et /portal ne sont pas préfixés par
     langue (le tableau de bord suit un cookie), et les segments dynamiques
     ne se vérifient pas par présence de dossier. */
  const publiques = toutes.filter(
    (p) =>
      !p.startsWith("/admin") &&
      !p.startsWith("/portal") &&
      !p.startsWith("/api") &&
      !p.startsWith("/en") &&
      !p.includes("["),
  );
  assert.ok(publiques.length >= 4, `trop peu de pages publiques trouvées : ${publiques.length}`);

  const anglaises = new Set(toutes.filter((p) => p.startsWith("/en")));

  const morts = [];
  for (const page of publiques) {
    const cible = switchLocalePath(page, "en");
    if (cible === "/en") continue; // repli assumé vers l'accueil anglais
    if (!anglaises.has(cible)) morts.push(`${page} → ${cible}`);
  }
  assert.deepEqual(morts, [], "le sélecteur pointe vers des pages inexistantes :\n" + morts.join("\n"));

  // Sens inverse : le retour au français existe toujours, c'est la référence.
  for (const page of anglaises) {
    const retour = switchLocalePath(page, "fr");
    assert.ok(toutes.includes(retour), `retour au français cassé : ${page} → ${retour}`);
  }
});

test("les liens pointent seulement vers des pages anglaises publiées", async () => {
  // Une route n'est préfixée que lorsqu'un wrapper anglais existe réellement.
  const { localeHref } = await import("../src/lib/i18n/config.ts");
  assert.equal(localeHref("/", "en"), "/en");
  assert.equal(localeHref("/auth/register", "en"), "/en/auth/register");
  assert.equal(localeHref("/contact", "en"), "/en/contact");
  assert.equal(localeHref("/blog", "en"), "/en/blog");
  assert.equal(localeHref("/support", "en"), "/support");
  // En français, rien ne bouge.
  assert.equal(localeHref("/auth/register", "fr"), "/auth/register");
});

test("les composants client ne reçoivent que des données sérialisables", async () => {
  // Le build a échoué là-dessus : passer le dictionnaire entier à LandingNav
  // (composant client) faisait traverser des fonctions d'interpolation la
  // frontière serveur/client, ce que React refuse.
  const { readFile } = await import("node:fs/promises");
  const nav = await readFile(new URL("../src/components/landing/LandingNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /"use client"/);
  assert.match(nav, /nav: Nav;/, "LandingNav ne doit recevoir que la tranche `nav`");
  assert.doesNotMatch(nav, /dict: Dictionary;/, "le dictionnaire complet contient des fonctions");

  const page = await readFile(new URL("../src/components/landing/LandingPage.tsx", import.meta.url), "utf8");
  assert.match(page, /<LandingNav nav=\{dict\.nav\}/);
  assert.match(page, /<BackToTop label=\{dict\.backToTop\}/);

  // TestimonialForm est le second composant client de la landing : il reçoit
  // une TRANCHE de dictionnaire, qui doit rester exempte de fonctions.
  const form = await readFile(new URL("../src/components/landing/TestimonialForm.tsx", import.meta.url), "utf8");
  assert.match(form, /"use client"/);
  assert.match(form, /t: Dictionary\["testimonials"\]\["form"\];/);
  const { fr: dico } = await import("../src/lib/i18n/fr.ts");
  const { en: dicoEn } = await import("../src/lib/i18n/en.ts");
  for (const [lang, d] of [["fr", dico], ["en", dicoEn]]) {
    for (const [k, v] of Object.entries(d.testimonials.form)) {
      assert.notEqual(typeof v, "function", `${lang}.testimonials.form.${k} est une fonction : elle ne peut pas traverser la frontière client`);
    }
  }
});

test("aucune chaîne française n'est restée en dur dans les composants de la landing", async () => {
  // Le dictionnaire ne sert à rien si un composant réaffiche du texte en dur :
  // la page /en le rendrait en français sans qu'aucun type ne s'en aperçoive.
  //
  // Le périmètre est CALCULÉ à partir des imports de LandingPage, pas listé à
  // la main : une section ajoutée demain est couverte sans y penser, et un
  // composant qui n'est pas sur la landing (MapEmbed, page contact) n'y entre
  // pas par accident. Les COMMENTAIRES du code restent en français, c'est
  // voulu — on les retire avant d'analyser.
  const { readFile } = await import("node:fs/promises");
  const base = new URL("../src/components/landing/", import.meta.url);

  const sansCommentaires = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Parcours transitif des imports relatifs depuis LandingPage.
  const vus = new Set();
  const sources = new Map();
  const visiter = async (nom) => {
    if (vus.has(nom)) return;
    vus.add(nom);
    let brut;
    try {
      brut = await readFile(new URL(nom, base), "utf8");
    } catch {
      return; // import hors du dossier landing (@/components/…) : hors périmètre
    }
    // Les valeurs de className sont retirées AVANT l'analyse : elles sont
    // pleines de mots qui ressemblent à du texte. L'ancien filtre les écartait
    // par heuristique (« pas d'espace + un tiret ») et laissait donc passer
    // placeholder="vous@votre-reseau.ci", resté en dur dans le pied de page.
    const src = sansCommentaires(brut).replace(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^{}]*\})/g, "");
    sources.set(nom, src);
    for (const m of src.matchAll(/from "\.\/([A-Za-z0-9_]+)"/g)) await visiter(`${m[1]}.tsx`);
  };
  await visiter("LandingPage.tsx");
  assert.ok(sources.size > 15, `périmètre trop petit : ${sources.size} fichiers`);
  assert.ok(!sources.has("MapEmbed.tsx"), "MapEmbed appartient à la page contact");

  // Deux familles : les mots-outils, et des mots pleins qui n'existent pas en
  // anglais. Sans les seconds, « ${days} jours offerts » passait : ni accent,
  // ni mot-outil. On évite soigneusement les faux amis (« note », « site »).
  const motsOutils = /\b(le|la|les|des|une|vos|votre|nos|notre|pour|avec|sans|dans|sur|par|est|sont|chaque|entre|depuis|aucun|aucune|vous|nous|jours|mois|gratuit|gratuits|gratuite|gratuites|offert|offerts|offerte|offertes|essai|routeur|routeurs|utilisateur|utilisateurs|entreprise|paiement|abonnement|temoignage|envoyer|ouvrir|commencer|demarrer|reseau|navigateur|vouchers?)\b/i;
  const accents = /[àâçéèêëîïôùûœ]/i;

  /* Ni imports, ni URL, ni ancres/identifiants : « #tarifs » et id="tarifs"
     sont des slugs partagés par les deux routes, pas du texte affiché. */
  const ignorable = (v) => /^[@./]|^https?:/.test(v) || /^#?[a-z0-9-]+$/.test(v);

  const fautes = [];
  for (const [nom, src] of sources) {
    const suspects = [];
    for (const m of src.matchAll(/"([^"\n]{6,})"|'([^'\n]{6,})'/g)) {
      const v = m[1] ?? m[2];
      if (ignorable(v)) continue;
      if (motsOutils.test(v) || accents.test(v)) suspects.push(v);
    }
    // Gabarits entre accents graves : `dès ${x} FCFA` s'affichait en français
    // sur /en sans qu'aucune chaîne entre guillemets ne le trahisse.
    for (const m of src.matchAll(/`([^`]{4,})`/g)) {
      const v = m[1];
      if (ignorable(v)) continue;
      if (motsOutils.test(v) || accents.test(v)) suspects.push(v);
    }
    for (const m of src.matchAll(/>\s*([A-Za-zÀ-ÿ][^<>{}\n]{5,})\s*</g)) {
      const v = m[1].trim();
      if (motsOutils.test(v) || accents.test(v)) suspects.push(v);
    }
    for (const v of new Set(suspects)) fautes.push(`${nom} → « ${v} »`);
  }
  assert.deepEqual(fautes, [], "texte en dur à passer par le dictionnaire :\n" + fautes.join("\n"));
});
