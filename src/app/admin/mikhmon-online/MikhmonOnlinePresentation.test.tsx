import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import MikhmonOnlineConsole, { ChoixRouteur, type MikhmonRouter } from "./MikhmonOnlineList";

const parc: MikhmonRouter[] = [
  {
    id: "r-cloud-actif",
    name: "HSPT-ABDOULATIF",
    status: "online",
    model: "RB951Ui-2HnD",
    kind: "cloud",
    cloudDomain: "hspt-abdoulatif-1a2b3c4d.mikhmon.safelinkhub.io", cloudStatus: "active", cloudEdition: "v6",
    tunnelLink: null,
  },
  {
    id: "r-cloud-a-activer",
    name: "MAMBA-WIFI",
    status: "offline",
    model: "hEX",
    kind: "cloud",
    cloudDomain: null, cloudStatus: null, cloudEdition: null,
    tunnelLink: null,
  },
  {
    id: "r-conteneur",
    name: "SHIA-HSPT",
    status: "online",
    model: "hAP ax²",
    kind: "container",
    cloudDomain: "shia-hspt.mikhmon.safelinkhub.io", cloudStatus: "active", cloudEdition: "v7",
    tunnelLink: "http://s2.safelinkhub.io:31234",
  },
  {
    id: "r-inconnu",
    name: "RUE-NICOLAS",
    status: "online",
    model: null,
    kind: "unknown",
    cloudDomain: null, cloudStatus: null, cloudEdition: null,
    tunnelLink: null,
  },
];

const rendu = (routers: MikhmonRouter[]) =>
  renderToStaticMarkup(<MikhmonOnlineConsole routers={routers} />);

describe("station MikHmon Online", () => {
  it("présente un plan unique pour le parc, sans perdre la lecture des capacités", () => {
    const html = rendu(parc);
    /* Les deux éditions portent désormais le surnom que l'exploitant emploie :
       « v6 » pour les cartes restées en RouterOS 6, « v7 » pour celles qui
       savent héberger un conteneur. Le surnom parle du ROUTEUR, pas du numéro
       de version de MikHmon — voir mikhmon-editions.ts. */
    assert.match(html, /MikHmon déjà présent sur le routeur/);
    assert.match(html, /MikHmon v6 — sans conteneur, domaine dédié/);
    assert.match(html, /Capacité pas encore déterminée/);
    assert.match(html, /Générer MikHmon Online/);
    assert.match(html, /500 F CFA \/ mois/);
    assert.match(html, /WireGuard/);
    assert.match(html, /OpenVPN/);
    assert.match(html, /L2TP/);
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

  it("un domaine cloud sur une carte Container se gère aussi (désactiver, supprimer)", () => {
    /* La gestion n'était branchée que sur la famille « sans conteneur » : sur
       le parc réel (tout en Container), un domaine créé ne pouvait être ni
       désactivé ni supprimé — et, une fois arrêté, il disparaissait de l'écran. */
    const conteneur = parc.find((r) => r.id === "r-conteneur")!;
    const actif = rendu([conteneur]);
    assert.match(actif, /Gérer le domaine/);
    assert.equal(actif.match(/Ouvrir MikHmon/g)?.length, 1, "un seul bouton Ouvrir, pas un doublon");

    const arrete = rendu([{ ...conteneur, cloudStatus: "stopped" }]);
    assert.match(arrete, /désactivé/);
    assert.match(arrete, /shia-hspt\.mikhmon\.safelinkhub\.io/);
    assert.match(arrete, /Gérer le domaine/);
    assert.doesNotMatch(arrete, /Créer un domaine SafeLinkHub/);
  });

  it("le choix du routeur tient dans l'écran et défile, même avec tout le parc", () => {
    /* La fenêtre était centrée sans hauteur maximale : avec 13 routeurs, le
       haut et le bas sortaient de l'écran et rien ne défilait. */
    const flotte = Array.from({ length: 13 }, (_, i) => ({
      ...parc[2],
      id: `r-${i}`,
      name: `HSPT-${i}`,
      status: i % 4 ? "online" : "offline",
    }));
    const html = renderToStaticMarkup(
      <ChoixRouteur routers={flotte} dejaEquipes={[parc[0]]} onChoose={() => {}} onClose={() => {}} />,
    );
    // Hauteur bornée ET marge visible en haut comme en bas, sur tout écran.
    assert.match(html, /max-h-\[calc\(100dvh-2rem\)\]/, "hauteur bornée avec marge");
    assert.match(html, /items-center justify-center bg-slate-deep\/60 p-4/, "espace autour de la fenêtre");
    assert.match(html, /overflow-y-auto/, "la liste défile");
    assert.match(html, /Chercher parmi 13 routeurs/);
    assert.match(html, /Hors ligne/);
    assert.match(html, /HSPT-ABDOULATIF a déjà son domaine/);
  });

  it("compte chaque famille séparément", () => {
    const html = rendu(parc);
    for (const [libelle, valeur] of [
      ["Parc lié", 4],
      ["Domaines dédiés", 2], // les instances cloud actives, y compris une carte Container
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
