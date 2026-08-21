import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

/** Les blocs @media (prefers-reduced-motion: reduce) — il y en a plusieurs.
 *  Découper sur la requête seule laisse déborder le CSS qui suit le bloc ;
 *  on s'arrête à l'accolade fermante en début de ligne, qui clôt le média. */
function blocsMouvementReduit(css) {
  return css.split("@media (prefers-reduced-motion: reduce)").slice(1).map((seg) => {
    const fin = seg.search(/\n\}\n/);
    return fin === -1 ? seg : seg.slice(0, fin);
  });
}


test("chaque constructeur annoncé possède son logo, et réciproquement", async () => {
  // `vendors` sert AUSSI à compter « 8 constructeurs pris en charge » dans le
  // hero. Ajouter un nom sans son fichier laisserait un trou dans le bandeau
  // tout en incrémentant le compteur.
  const content = await read("src/components/landing/content.ts");
  const noms = [...content.matchAll(/^\s{2}"([^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(noms.length >= 8, `liste des constructeurs introuvable (${noms.length})`);

  const marquee = await read("src/components/landing/VendorMarquee.tsx");
  const fichiers = await readdir(new URL("../public/partenariat", import.meta.url));

  for (const nom of noms) {
    const ligne = marquee.match(new RegExp(`"${nom.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}":\\s*\\{ file: "([^"]+)"`));
    assert.ok(ligne, `${nom} n'a pas d'entrée dans LOGOS`);
    assert.ok(fichiers.includes(ligne[1]), `${ligne[1]} manque dans public/partenariat`);
  }
});

test("aucun nom de fichier à espace ou parenthèse", async () => {
  // « images (1).png » aurait imposé un encodage d'URL, silencieusement cassé
  // par le moindre outil qui recopie le chemin.
  const fichiers = (await readdir(new URL("../public/partenariat", import.meta.url)))
    .filter((f) => !f.startsWith("."));
  for (const f of fichiers) {
    assert.match(f, /^[a-z0-9.-]+$/, `${f} doit être en minuscules, sans espace`);
  }
});

test("la boucle du bandeau ne peut pas sauter", async () => {
  const css = await read("src/app/globals.css");
  const bloc = css.slice(css.indexOf(".marquee-track {"));
  // Sans width:max-content la piste se plie au conteneur, les deux copies se
  // superposent et -50 % ne retombe plus sur un multiple de la liste.
  assert.match(bloc.slice(0, 200), /width: max-content/);
  // Et le sens demandé est bien gauche → droite.
  assert.match(css, /@keyframes marquee-rtl \{\s*from \{ transform: translateX\(-50%\); \}/);

  const marquee = await read("src/components/landing/VendorMarquee.tsx");
  assert.match(marquee, /<Row \/>\s*<Row hidden \/>/, "il faut exactement deux copies");
});

test("le mouvement réduit arrête la piste sans la décaler", async () => {
  // Le bloc générique fixe les durées à 0,01 ms : la piste se figerait sur
  // translateX(0), donc sur la SECONDE copie, la première hors champ.
  const css = await read("src/app/globals.css");
  const bloc = blocsMouvementReduit(css).find((b) => b.includes(".marquee-track"));
  assert.ok(bloc, "aucun bloc mouvement réduit ne couvre le bandeau");
  assert.match(bloc, /\.marquee-track \{[^}]*transform: none !important/s);
  assert.match(bloc, /\[aria-hidden="true"\] \{ display: none/);
});
