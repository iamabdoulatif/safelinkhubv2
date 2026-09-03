import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ConversionView from "./ConversionView";

const jours = [
  { day: "2026-09-03", paid: 0, reached: 3, abandoned: 10, total: 13 },
  { day: "2026-09-02", paid: 1, reached: 12, abandoned: 12, total: 25 },
];
const totaux = { paid: 5, reached: 88, abandoned: 140, total: 233, revenue: 2800 };

test("l'entonnoir dit où les commandes se perdent, pas seulement combien", () => {
  const markup = renderToStaticMarkup(
    <ConversionView daily={jours} sum={totaux} pendingPayments={[]} allOrgs />,
  );

  // Le chiffre qui commande la lecture.
  assert.match(markup, />2%</);
  // Les trois marches, à leur volume réel — 93 = payés + engagés.
  assert.match(markup, />233</);
  assert.match(markup, />93</);
  assert.match(markup, />5</);
  // Et surtout : ce qui se perd ENTRE les marches, en toutes lettres.
  assert.match(markup, /−140/);
  assert.match(markup, /sans même choisir de moyen de paiement/);
  assert.match(markup, /−88/);
});

test("une journée sans paiement affiche un tiret, jamais un « 0 » en vert", () => {
  // Colorer un zéro en vert lui donne l'air d'une bonne nouvelle ; le tiret
  // dit « rien », ce qui est la vérité.
  const markup = renderToStaticMarkup(
    <ConversionView daily={jours} sum={totaux} pendingPayments={[]} allOrgs={false} />,
  );
  assert.doesNotMatch(markup, /text-ok[^"]*">0</);
  assert.match(markup, /—/);
});

test("la table se termine par un total : sans lui, on additionne à la main", () => {
  const markup = renderToStaticMarkup(
    <ConversionView daily={jours} sum={totaux} pendingPayments={[]} allOrgs={false} />,
  );
  assert.match(markup, /<tfoot/);
  assert.match(markup, />Total</);
});

test("sans commande, la page explique au lieu d'afficher un entonnoir vide", () => {
  const markup = renderToStaticMarkup(
    <ConversionView
      daily={[]}
      sum={{ paid: 0, reached: 0, abandoned: 0, total: 0, revenue: 0 }}
      pendingPayments={[]}
      allOrgs={false}
    />,
  );
  assert.match(markup, /Aucune commande sur la période/);
  assert.doesNotMatch(markup, /<table/);
});
