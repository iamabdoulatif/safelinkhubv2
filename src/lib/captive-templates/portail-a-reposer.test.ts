import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { portailAReposer, type ModeleCandidat } from "./portail-a-reposer";

const m = (id: string, name: string, isDefault = false, templateType = "package"): ModeleCandidat => ({
  id,
  name,
  isDefault,
  templateType,
});

const catalogue = [m("a", "SafeLinkHub"), m("b", "Baraka", true), m("c", "Yahya Wifi")];

describe("quel portail reposer", () => {
  it("celui que le routeur porte déjà, avant tout", () => {
    const v = portailAReposer("c", catalogue);
    assert.equal(v.ok && v.templateId, "c");
    assert.equal(v.ok && v.origine, "routeur");
  });

  it("le défaut de l'org quand le routeur n'en porte aucun", () => {
    const v = portailAReposer(null, catalogue);
    assert.equal(v.ok && v.templateId, "b");
    assert.equal(v.ok && v.origine, "defaut-org");
  });

  it("un modèle assigné qui a DISPARU fait refuser, pas retomber sur le défaut", () => {
    /* Retomber sur le défaut remplacerait silencieusement le portail d'une
       zone par celui d'une autre — autre marque, autres forfaits — et
       l'exploitant croirait avoir simplement corrigé ses prix. */
    const v = portailAReposer("supprimé", catalogue);
    assert.equal(v.ok, false);
    assert.match(!v.ok ? v.erreur : "", /n'existe plus/);
  });

  it("sans défaut ni assignation, on refuse avec la marche à suivre", () => {
    const v = portailAReposer(null, [m("a", "SafeLinkHub")]);
    assert.equal(v.ok, false);
    assert.match(!v.ok ? v.erreur : "", /Réglages/);
  });

  it("un modèle qui n'est pas un portail multi-fichiers est ignoré", () => {
    // Seuls les « package » s'installent sur un routeur ; un modèle d'une
    // autre nature choisi ici échouerait plus loin, sans message utile.
    const v = portailAReposer("html", [m("html", "Page unique", true, "single")]);
    assert.equal(v.ok, false);
  });

  it("aucune erreur ne laisse l'exploitant sans quoi faire", () => {
    for (const v of [portailAReposer("absent", catalogue), portailAReposer(null, [])]) {
      assert.equal(v.ok, false);
      assert.ok(!v.ok && v.erreur.length > 30, "message trop court pour agir");
    }
  });
});

describe("la réparation est atteignable depuis le routeur", () => {
  const lire = async (rel: string) => {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL(rel, import.meta.url), "utf8");
  };

  it("le bouton vit sur la fiche du routeur, pas seulement dans les réglages", async () => {
    /* C'était toute la lacune : l'installation n'existait que dans
       Réglages → Portails captifs, un écran organisé par MODÈLE. Quand un
       routeur affiche un mauvais prix, on part du routeur. */
    const header = await lire("../../app/admin/router/[id]/HeaderActions.tsx");
    assert.match(header, /reposerPortailRouteur\(routerId\)/);
  });

  it("la repose passe par l'installation existante, pas par une seconde écriture", async () => {
    /* Deux chemins d'écriture donneraient deux portails subtilement
       différents — et c'est justement l'installation qui régénère les prix
       depuis la table packages. */
    const actions = await lire("./actions.ts");
    const bloc = actions.slice(actions.indexOf("export async function reposerPortailRouteur"));
    assert.match(bloc, /installTemplateOnRouter\(routerId, verdict\.templateId/);
  });

  it("la repose vérifie l'appartenance du routeur", async () => {
    // Une action serveur exportée reste un endpoint POST appelable directement.
    const actions = await lire("./actions.ts");
    const bloc = actions.slice(
      actions.indexOf("export async function reposerPortailRouteur"),
      actions.indexOf("export async function assignTemplateToBridge"),
    );
    assert.match(bloc, /router\.orgId !== session\.orgId/);
  });
});
