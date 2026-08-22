import { readFile } from "node:fs/promises";
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


test("aucun contenu ne peut rester invisible faute de JavaScript", async () => {
  // La règle qui masque doit vivre sous @media (scripting: enabled) : sans JS,
  // ou dans un navigateur qui ignore la requête, la page reste lisible.
  const css = await read("src/app/globals.css");
  const i = css.indexOf(".reveal { opacity: 0; }");
  assert.ok(i > 0, ".reveal doit exister");
  const avant = css.slice(0, i);
  const media = avant.lastIndexOf("@media (scripting: enabled)");
  const fermeture = avant.lastIndexOf("\n}\n");
  assert.ok(media > fermeture, "l'état masqué doit être sous @media (scripting: enabled)");
});

test("le mouvement réduit rend tout visible, sans exception", async () => {
  const css = await read("src/app/globals.css");
  // Le bloc générique ramène les durées à 0,01 ms — insuffisant : un .reveal
  // dont l'observateur ne se déclenche jamais resterait à opacity 0.
  // Repéré par son CONTENU, pas par sa position : il existe plusieurs blocs
  // « mouvement réduit », et se fier au dernier casse dès qu'on en ajoute un.
  const bloc = blocsMouvementReduit(css).find((b) => b.includes(".reveal,"));
  assert.ok(bloc, "aucun bloc mouvement réduit ne couvre .reveal");
  assert.match(bloc, /\.reveal[^{]*\{[^}]*opacity: 1 !important/s);
  assert.match(bloc, /\.marker-sweep\s*\{[^}]*background-size: 100% 100% !important/s);
});

test("l'observateur se rejoue à la navigation et se rattrape en cas d'échec", async () => {
  const src = await read("src/components/motion/Reveal.tsx");
  // Monté dans le layout /admin, l'effet ne se rejouerait pas d'une page à
  // l'autre : la coquille persiste et les blocs suivants resteraient masqués.
  assert.match(src, /usePathname/);
  assert.match(src, /\}, \[pathname\]\);/);
  // Le délai de garde ne rattrape QUE ce qui est déjà dans le champ. Une
  // première version révélait tout : elle annulait l'effet qu'elle protégeait,
  // le bas de page apparaissant sans qu'on y soit jamais descendu.
  assert.match(src, /r\.top < window\.innerHeight && r\.bottom > 0/);
  assert.doesNotMatch(src, /setTimeout\(\(\) => nodes\.forEach\(show\)/);
  assert.match(src, /clearTimeout\(safety\)/);
});

test("le compteur restitue la valeur rendue par le serveur", async () => {
  // Le serveur écrit déjà « 1 579 » avec son espace fine insécable. Recomposer
  // la chaîne en JavaScript risquerait un formatage différent ; on la remet
  // telle quelle à la dernière image.
  const src = await read("src/components/motion/Reveal.tsx");
  assert.match(src, /const final = el\.textContent \?\? "";/);
  assert.match(src, /el\.textContent = final;/);
});

test("le tableau de bord ne retarde pas son bandeau d'alerte", async () => {
  const view = await read("src/app/admin/DashboardView.tsx");
  const banniere = view.slice(view.indexOf("reseller?.pendingPayment"), view.indexOf("{t.tiles.title}"));
  assert.doesNotMatch(banniere, /className="[^"]*\breveal\b/, "une alerte ne s'anime pas, elle s'affiche");
  // Et la cascade reste courte : un cockpit se lit en urgence.
  assert.match(view, /"--stagger-step": "45ms"/);
});
