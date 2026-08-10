import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la navigation publique expose le cadre scanner et le repli mouvement réduit", async () => {
  const [nav, styles] = await Promise.all([
    read("src/components/landing/LandingNav.tsx"),
    read("src/app/globals.css"),
  ]);

  assert.match(nav, /nav-scanner-link/, "les liens desktop doivent porter le contrat d'animation");
  assert.match(nav, /nav-mobile-panel/, "le panneau mobile doit exposer son contrat d'entrée");
  assert.match(nav, /nav-mobile-item/, "les entrées mobiles doivent pouvoir être séquencées");
  assert.match(styles, /\.nav-scanner-link::before/, "le cadre doit être rendu par un pseudo-élément");
  assert.match(styles, /\.nav-scanner-link:hover::before/, "le survol doit révéler le cadre");
  assert.match(styles, /\.nav-scanner-link:focus-visible::before/, "le clavier doit recevoir le même retour");
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/, "le mouvement réduit doit être pris en charge");
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.nav-mobile-item[\s\S]*?animation-delay:\s*0ms\s*!important/,
    "le mouvement réduit ne doit pas conserver le décalage du menu mobile",
  );
});
