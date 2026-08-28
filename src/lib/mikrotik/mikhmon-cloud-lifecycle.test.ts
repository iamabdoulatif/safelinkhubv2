import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionsPossibles, editionAReposer, verdictRenommage } from "./mikhmon-cloud-lifecycle";

const BASE = "mikhmon.safelinkhub.io";
const actif = { domain: `hspt-bamba.${BASE}`, status: "active", edition: "v6" };

describe("actions offertes selon l'état", () => {
  it("une instance en marche se désactive, une instance arrêtée s'active", () => {
    assert.deepEqual(actionsPossibles(actif), ["desactiver", "supprimer"]);
    assert.deepEqual(actionsPossibles({ ...actif, status: "stopped" }), ["activer", "supprimer"]);
  });

  it("une instance EN ÉCHEC reste supprimable", () => {
    /* C'est justement celle-là qu'on veut pouvoir retirer : sans ce cas, une
       provision à moitié faite resterait à l'écran sans aucun moyen de la
       nettoyer autrement qu'en base. */
    assert.ok(actionsPossibles({ ...actif, status: "failed" }).includes("supprimer"));
  });

  it("sans instance, aucune action", () => {
    assert.deepEqual(actionsPossibles(null), []);
  });
});

describe("changement d'adresse", () => {
  it("une adresse différente EXIGE de recréer le conteneur", () => {
    /* La règle Host() de Traefik est gravée dans les étiquettes Docker, et
       Docker ne sait pas les modifier. Sans recréation, l'ancienne adresse
       continuerait de servir et la nouvelle renverrait 404. */
    const v = verdictRenommage(actif, "agence-plateau", BASE);
    assert.equal(v.ok && v.recreer, true);
    assert.equal(v.ok && v.domaine, `agence-plateau.${BASE}`);
  });

  it("reposer LA MÊME adresse ne détruit rien", () => {
    // Sinon « Enregistrer » sans rien changer couperait le tableau pour rien.
    const v = verdictRenommage(actif, "hspt-bamba", BASE);
    assert.equal(v.ok && v.recreer, false);
  });

  it("une adresse invalide est refusée AVANT toute destruction", () => {
    for (const mauvais of ["", "a", "-debut", "fin-", "MAJ USCULE", "www"]) {
      assert.equal(verdictRenommage(actif, mauvais, BASE).ok, false, `accepté : ${mauvais}`);
    }
  });
});

describe("édition conservée", () => {
  it("un renommage ne change JAMAIS l'édition installée", () => {
    /* Un changement de nom qui ferait passer un tableau v6 en v7 donnerait une
       autre interface et des sessions illisibles. */
    assert.equal(editionAReposer({ ...actif, edition: "v6" }), "v6");
    assert.equal(editionAReposer({ ...actif, edition: "v7" }), "v7");
    // Valeur inconnue en base : on retombe sur v7, l'édition historique.
    assert.equal(editionAReposer({ ...actif, edition: "" }), "v7");
  });
});

describe("ce que la suppression touche, et ce qu'elle laisse", () => {
  it("la suppression ne vise QUE la redirection mikhmon", async () => {
    /* Un routeur porte souvent aussi une redirection WinBox ou SSH. Les
       supprimer avec le tableau couperait l'accès distant de l'exploitant,
       sans rapport avec le geste demandé. Vérifié sur la source : le delete
       doit être filtré par service. */
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./mikhmon-cloud-actions.ts", import.meta.url), "utf8");
    const bloc = src.slice(src.indexOf("supprimerMikhmonCloud"));
    assert.match(bloc, /delete\(routerPortForwards\)[\s\S]{0,300}service,\s*"mikhmon"/);
  });

  it("la suppression retire AUSSI la redirection, pas seulement l'instance", async () => {
    /* Sinon `enablePortForwardForRouter` court-circuite à la réactivation et
       répond « succès » sans rien créer. Les DEUX gestes doivent être là. */
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./mikhmon-cloud-actions.ts", import.meta.url), "utf8");
    const bloc = src.slice(src.indexOf("export async function supprimerMikhmonCloud"));
    assert.match(bloc, /removeCloudMikhmonInstance\(routerId\)/, "le conteneur n'est pas retiré");
    assert.match(bloc, /delete\(routerPortForwards\)/, "la redirection n'est pas retirée");
  });
});
