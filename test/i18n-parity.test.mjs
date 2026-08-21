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
  // WinBox n'est pas dans cette liste : il n'apparaît pas encore dans une
  // chaîne du dictionnaire — il vit dans Pricing.tsx, pas encore converti.
  for (const marque of ["MikroTik", "Safecoin", "SafeLinkHub", "Orange Money", "MTN MoMo", "Wave", "Moov Money", "RADIUS", "PPPoE"]) {
    assert.ok(texte.includes(marque), `« ${marque} » doit rester tel quel en anglais`);
  }
  // Et les montants restent en FCFA dans les deux langues.
  assert.ok(texte.includes("FCFA"));
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

test("aucun lien ne pointe vers une page anglaise qui n'existe pas", async () => {
  // Tant qu'une page n'est pas traduite, le lien doit rester sur la version
  // française : au pire dans la mauvaise langue, jamais un 404.
  const { localeHref } = await import("../src/lib/i18n/config.ts");
  assert.equal(localeHref("/", "en"), "/en");
  assert.equal(localeHref("/auth/register", "en"), "/auth/register");
  assert.equal(localeHref("/contact", "en"), "/contact");
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
});
