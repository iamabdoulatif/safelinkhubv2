import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import MikhmonOnlineConsole, { type MikhmonRouter } from "./MikhmonOnlineList";

const parc: MikhmonRouter[] = [
  {
    id: "r-cloud-actif",
    name: "HSPT-ABDOULATIF",
    status: "online",
    model: "RB951Ui-2HnD",
    kind: "cloud",
    cloudDomain: "hspt-abdoulatif-1a2b3c4d.mikhmon.safelinkhub.io",
    tunnelLink: null,
  },
  {
    id: "r-cloud-a-activer",
    name: "MAMBA-WIFI",
    status: "offline",
    model: "hEX",
    kind: "cloud",
    cloudDomain: null,
    tunnelLink: null,
  },
  {
    id: "r-conteneur",
    name: "SHIA-HSPT",
    status: "online",
    model: "hAP ax²",
    kind: "container",
    cloudDomain: null,
    tunnelLink: "http://s2.safelinkhub.io:31234",
  },
  {
    id: "r-inconnu",
    name: "RUE-NICOLAS",
    status: "online",
    model: null,
    kind: "unknown",
    cloudDomain: null,
    tunnelLink: null,
  },
];

const rendu = (routers: MikhmonRouter[]) =>
  renderToStaticMarkup(<MikhmonOnlineConsole routers={routers} />);

describe("station MikHmon Online", () => {
  it("sépare le parc selon l'endroit où MikHmon tourne réellement", () => {
    const html = rendu(parc);
    /* Les deux éditions portent désormais le surnom que l'exploitant emploie :
       « v6 » pour les cartes restées en RouterOS 6, « v7 » pour celles qui
       savent héberger un conteneur. Le surnom parle du ROUTEUR, pas du numéro
       de version de MikHmon — voir mikhmon-editions.ts. */
    assert.match(html, /MikHmon v6 — sans conteneur, domaine dédié/);
    assert.match(html, /MikHmon v7 — sur le routeur/);
    assert.match(html, /Capacité pas encore déterminée/);
  });

  it("montre le domaine dédié SANS attendre un clic", () => {
    /* C'est le défaut de l'écran précédent : le domaine — l'objet même de la
       fonctionnalité — dormait en base et n'apparaissait qu'après avoir
       cliqué « Obtenir le lien », routeur par routeur. */
    const html = rendu(parc);
    assert.match(html, /https:\/\/hspt-abdoulatif-1a2b3c4d\.mikhmon\.safelinkhub\.io/);
  });

  it("distingue une instance en place d'une instance à créer", () => {
    const html = rendu(parc);
    assert.match(html, /Aucune instance dédiée/);
    assert.match(html, /Activer depuis MikHmon Online/, "le chemin d'activation doit rester dans la station");
    assert.match(html, /<button type="button"/, "le chemin d'activation doit être cliquable");
  });

  it("affiche le lien tunnel d'un routeur à conteneur sans sonder l'équipement", () => {
    // Shard + port viennent de la base ; aucune connexion RouterOS requise.
    const html = rendu(parc);
    assert.match(html, /http:\/\/s2\.safelinkhub\.io:31234/);
  });

  it("compte chaque famille séparément", () => {
    const html = rendu(parc);
    for (const [libelle, valeur] of [
      ["Parc lié", 4],
      ["Domaines dédiés", 1], // seul celui dont l'instance est active
      ["Sur le routeur", 1],
      ["Capacité inconnue", 1],
    ] as const) {
      const bloc = html.slice(html.indexOf(libelle));
      assert.match(
        bloc.slice(0, 220),
        new RegExp(`>${valeur}<`),
        `compteur faux pour « ${libelle} »`,
      );
    }
  });

  it("ne masque pas la famille « capacité inconnue » quand elle est vide", () => {
    // Elle disparaît alors, plutôt que d'afficher une section vide et anxiogène.
    const html = rendu(parc.filter((r) => r.kind !== "unknown"));
    assert.doesNotMatch(html, /Capacité pas encore déterminée/);
  });

  it("un parc vide dit quoi faire au lieu de n'afficher que des zéros", () => {
    const html = rendu([]);
    assert.match(html, /Aucun routeur lié/);
    assert.doesNotMatch(html, /MikHmon v6/);
  });
});
