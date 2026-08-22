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
  const ordre = [...nav.matchAll(/\{ href: "([^"]+)", label: nav\.(\w+) \}/g)].map((m) => m[1]);
  assert.deepEqual(ordre, ["/services", "/vpn", "/formations", "/boutique", "/contact"]);
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
