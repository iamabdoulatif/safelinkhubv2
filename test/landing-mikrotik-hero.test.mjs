import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* Hero « Control Room » : film du hAP ax³ piloté au scroll (séquence d'images
 * sur desktop), vidéo maître sur mobile, affiche seule en mouvement réduit. */

test("chaque fichier du film annoncé par le hero existe", async () => {
  const hero = await read("src/components/landing/Hero.tsx");
  const count = Number(hero.match(/frameCount:\s*(\d+)/)?.[1]);
  const frames = await readdir(new URL("../public/landing/control-room/frames/", import.meta.url));
  assert.equal(frames.filter((f) => f.endsWith(".webp")).length, count, "nombre d'images ≠ frameCount");
  for (const f of ["poster.jpg", "film.mp4", "film.webm", "network.webp", "ports.webp"]) {
    await access(new URL(`../public/landing/control-room/${f}`, import.meta.url));
  }
});

test("le film respecte le mouvement réduit et ne capte pas les lecteurs d'écran", async () => {
  const film = await read("src/components/landing/ScrollFilm.tsx");
  assert.match(film, /"use client"/);
  assert.match(film, /prefers-reduced-motion: reduce/);
  // Mouvement réduit : l'affiche, ni scrub ni vidéo.
  assert.match(film, /setMode\(reduced \? "poster"/);
  assert.match(film, /<canvas ref=\{canvasRef\} aria-hidden="true"/);
  // Le texte vit dans le HTML, jamais dans les images générées.
  assert.doesNotMatch(film, /fillText/);
});

test("le hero garde ses chiffres réels, sa capture e-mail et les constructeurs", async () => {
  const hero = await read("src/components/landing/Hero.tsx");
  for (const key of ["routers", "sessions", "trial", "mobileMoney"]) {
    assert.match(hero, new RegExp(`t\\.cards\\.${key}\\b`), `chiffre manquant : ${key}`);
  }
  // Un volume absent est MASQUÉ plutôt qu'affiché à zéro.
  assert.match(hero, /\.filter\(\(c\) => c\.value !== undefined\)/);
  assert.match(hero, /action=\{localeHref\("\/auth\/register", locale\)\}/);
  assert.match(hero, /<VendorMarquee dict=\{dict\} \/>/);
});

test("les phrases du film sont traduites", async () => {
  const [{ fr }, { en }] = await Promise.all([import("../src/lib/i18n/fr.ts"), import("../src/lib/i18n/en.ts")]);
  assert.equal(fr.hero.film.length, en.hero.film.length);
  assert.notEqual(fr.hero.film[0].title, en.hero.film[0].title);
  assert.equal(fr.controlRoom.cockpit.vendors.length, en.controlRoom.cockpit.vendors.length);
});
