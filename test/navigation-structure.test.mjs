import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("le header suit l'ordre demandé et ne pointe plus vers des ancres", async () => {
  /* Spécifié par l'utilisateur : logo, Services, VPN, Formations, Boutique,
     Contact, loupe, Tableau de bord, Fr/En. Les entrées mènent à des PAGES :
     les anciennes ancres (#features, #plateforme) visaient des sections qui
     ont déménagé, et un lien d'ancre vers une section absente ne défile nulle
     part sans que rien ne le signale. */
  const nav = await read("src/components/landing/LandingNav.tsx");
  // « Services » a quitté la liste plate : c'est désormais un menu déroulant,
  // rendu avant les autres entrées.
  assert.match(nav, /<ServicesMenu menu=\{nav\.servicesMenu\} locale=\{locale\} \/>/);
  const ordre = [...nav.matchAll(/\{ href: "([^"]+)", label: nav\.(\w+) \}/g)].map((m) => m[1]);
  assert.deepEqual(ordre, ["/vpn", "/formations", "/boutique", "/contact"]);
  assert.doesNotMatch(nav, /href: "#/, "plus aucune ancre dans le header");

  // La loupe existe, et le menu mobile la reprend puisqu'elle y est masquée.
  assert.match(nav, /localeHref\("\/recherche", locale\)/);
  assert.equal((nav.match(/\/recherche/g) ?? []).length >= 2, true, "recherche absente du menu mobile");
});

test("les sections déplacées ne sont plus servies deux fois", async () => {
  // Déplacées, pas recopiées : deux pages portant le même contenu se
  // concurrenceraient au référencement.
  const landing = await read("src/components/landing/LandingPage.tsx");
  for (const section of ["FeaturesGrid", "PlatformDark", "HardwareSection", "Pricing"]) {
    assert.doesNotMatch(landing, new RegExp(`<${section}[ /]`), `${section} devrait avoir quitté la landing`);
  }
  const services = await read("src/app/services/page.tsx");
  for (const section of ["FeaturesGrid", "PlatformDark", "HardwareSection"]) {
    assert.match(services, new RegExp(`<${section}[ /]`), `${section} manque sur /services`);
  }
  assert.match(await read("src/app/vpn/page.tsx"), /<Pricing /);
});

test("le pied de page ne garde aucune ancre vers une section partie", async () => {
  const footer = await read("src/components/landing/LandingFooter.tsx");
  for (const ancre of ["#features", "#plateforme", "#tarifs"]) {
    assert.doesNotMatch(footer, new RegExp(ancre), `${ancre} ne défile plus nulle part`);
  }
  // #faq reste : la FAQ n'a pas bougé.
  assert.match(footer, /#faq/);
});

test("le blog reste atteignable bien qu'il ait quitté le header", async () => {
  /* Six articles publiés : sans porte depuis /formations, ils seraient
     devenus orphelins, accessibles par URL directe seulement. */
  const formations = await read("src/app/formations/page.tsx");
  assert.match(formations, /localeHref\("\/blog", locale\)/);
  assert.match(await read("src/components/landing/LandingFooter.tsx"), /"\/formations"/);
});

test("les pages indexées par la recherche existent réellement", async () => {
  const { readdir } = await import("node:fs/promises");
  const src = await read("src/lib/search/queries.ts");
  const chemins = [...src.matchAll(/\{ path: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(chemins.length >= 5, "registre de pages trop court");
  const app = await readdir(new URL("../src/app/", import.meta.url));
  for (const chemin of chemins) {
    assert.ok(app.includes(chemin.slice(1)), `la recherche indexe ${chemin}, qui n'existe pas`);
  }
});

test("le menu Services est utilisable au clavier et au doigt", async () => {
  /* Un menu qui ne s'ouvrirait qu'au survol serait inatteignable au clavier
     ET au doigt — c'est-à-dire pour une bonne part du trafic. */
  const menu = await read("src/components/landing/ServicesMenu.tsx");
  assert.match(menu, /onClick=\{\(\) => setOuvert/, "le clic doit ouvrir, pas seulement le survol");
  assert.match(menu, /aria-expanded=\{ouvert\}/);
  assert.match(menu, /aria-controls=\{panneauId\}/);
  assert.match(menu, /e\.key === "Escape"/, "Échap doit refermer");
  assert.match(menu, /bouton\.current\?\.focus\(\)/, "le focus doit revenir au bouton");

  // Les quatre services demandés, et leurs destinations.
  for (const href of ["/vpn", "/services/hotspot", "/services/videosurveillance", "/services/firewall"]) {
    assert.match(menu, new RegExp(`href: "${href}"`), `service manquant : ${href}`);
  }
});

test("les quatre services du menu mènent à des pages qui existent", async () => {
  const { readdir } = await import("node:fs/promises");
  const services = await readdir(new URL("../src/app/services/", import.meta.url));
  for (const slug of ["hotspot", "videosurveillance", "firewall"]) {
    assert.ok(services.includes(slug), `/services/${slug} n'existe pas`);
  }
  // Le menu mobile les reprend : sur mobile il n'y a pas de survol.
  const nav = await read("src/components/landing/LandingNav.tsx");
  assert.match(nav, /nav\.servicesMenu\.cameraTitle/);
});

test("aucune capacité n'est promise sur les offres non construites", async () => {
  /* Caméra et FireWall n'existent pas encore dans le produit. Leur page dit
     que l'offre est en préparation ; elle n'annonce aucune fonctionnalité,
     qui se paierait au premier client venu la réclamer. */
  const { fr } = await import("../src/lib/i18n/fr.ts");
  for (const cle of ["camera", "firewall"]) {
    const page = fr.servicePages[cle];
    assert.ok(page.soon.length > 40, `${cle} doit expliquer l'état réel de l'offre`);
    assert.equal("points" in page, false, `${cle} ne doit lister aucune fonctionnalité`);
  }
  // Hotspot, lui, décrit ce qui existe vraiment.
  assert.ok(fr.servicePages.hotspot.points.length >= 3);
});

test("une leçon est un article, et le contenu ne vit qu'à un endroit", async () => {
  /* Demandé explicitement : le contenu des formations se rédige dans
     l'éditeur d'articles. Un second éditeur propre aux leçons aurait dupliqué
     couverture, catégorie, publication et diffusion — et les deux auraient
     divergé à la première correction faite d'un seul côté. */
  const schema = await read("src/lib/db/schema.ts");
  /* Borné à la déclaration SUIVANTE, pas à une table repérée au hasard :
     portalOrders est déclaré AVANT courseLessons dans le fichier, ce qui
     donnait une tranche vide — et un test vert qui ne vérifiait rien. */
  const deb = schema.indexOf("export const courseLessons = pgTable(");
  assert.ok(deb > 0, "courseLessons introuvable");
  const bloc = schema.slice(deb, schema.indexOf("export const contactMessages"));
  assert.ok(bloc.length > 100, "tranche de schéma vide");
  assert.match(bloc, /postId: uuid\("post_id"\)/, "la leçon doit référencer un article");
  for (const champ of ["content", "video_url", "duration_minutes"]) {
    assert.doesNotMatch(bloc, new RegExp(`"${champ}"`), `${champ} ne doit plus vivre sur la leçon`);
  }
  // Un même article deux fois dans un parcours y apparaîtrait à deux rangs.
  assert.match(bloc, /uniqueIndex\("course_lessons_course_post_idx"\)/);

  // L'éditeur choisit et ordonne, il ne rédige pas.
  const editeur = await read("src/app/admin/formations/LessonsEditor.tsx");
  assert.match(editeur, /attachLesson/);
  assert.match(editeur, /moveLesson/);
  assert.doesNotMatch(editeur, /<textarea/, "aucune saisie de contenu dans l'éditeur de parcours");
  assert.match(editeur, /href="\/admin\/blog"/, "il doit renvoyer vers l'éditeur d'articles");
});

test("seuls des articles PUBLIÉS peuvent être rattachés", async () => {
  // Rattacher un brouillon donnerait une leçon qui disparaît du parcours
  // public sans explication : la requête publique écarte les dépubliés.
  const fiche = await read("src/app/admin/formations/[id]/page.tsx");
  assert.match(fiche, /eq\(blogPosts\.published, true\)/);
  const requetes = await read("src/lib/courses/queries.ts");
  assert.match(requetes, /eq\(blogPosts\.published, true\)/);
});

test("aucune carte de formation ne reste sans illustration", async () => {
  const page = await read("src/app/formations/page.tsx");
  assert.match(page, /const ILLUSTRATIONS = \[/, "il faut un repli visuel");
  assert.match(page, /ILLUSTRATIONS\[rang % ILLUSTRATIONS\.length\]/, "les repli doivent alterner");
  // Une couverture distante ne passe pas par next/image sans déclaration
  // d'hôte : on retombe sur une balise simple plutôt que de casser la page.
  assert.match(page, /\^https\?:\\\/\\\//);
});
