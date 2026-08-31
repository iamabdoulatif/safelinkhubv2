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

describe("un conteneur orphelin ne bloque plus la recréation", () => {
  const source = async () => {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL("./mikhmon-cloud.ts", import.meta.url), "utf8");
  };

  it("un homonyme est retiré AVANT le docker run", async () => {
    /* La panne observée : « container name is already in use ». Arrivé à la
       création, la base n'a aucune instance pour ce routeur — un conteneur
       portant son nom ne peut donc être qu'un orphelin. */
    const s = await source();
    const bloc = s.slice(s.indexOf("const args = ["));
    const rm = bloc.indexOf("rm -f ${shellArg(containerName)}");
    const run = bloc.indexOf("await input.run(args.join");
    assert.ok(rm > 0, "aucun retrait de l'homonyme");
    assert.ok(rm < run, "le retrait doit précéder la création");
  });

  it("l'absence de conteneur n'est pas une erreur", () => {
    // C'est le cas NORMAL : sans `|| true`, chaque première activation
    // échouerait sur un `docker rm` qui ne trouve rien.
    return source().then((s) =>
      assert.match(s, /rm -f \$\{shellArg\(containerName\)\} 2>\/dev\/null \|\| true/),
    );
  });

  it("une session qui échoue ne laisse pas le conteneur derrière", async () => {
    /* C'est ce chemin-là qui a fabriqué l'orphelin de HSPT-ADJA : la ligne en
       base ne s'écrit qu'à la toute fin, donc toute erreur après `docker run`
       laissait un conteneur invisible et bloquant. */
    const s = await source();
    const bloc = s.slice(s.indexOf("await input.run(args.join"));
    assert.match(bloc, /catch[\s\S]{0,400}rm -f \$\{shellArg\(containerName\)\}[\s\S]{0,200}throw/);
  });

  it("supprimer un routeur retire aussi son tableau du relais", async () => {
    /* Sans cela, le conteneur survit à son routeur : plus aucune trace en base
       pour le retrouver, un port occupé pour rien, et un blocage au retour. */
    const { readFile } = await import("node:fs/promises");
    const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
    const bloc = actions.slice(
      actions.indexOf("export async function deleteRouter"),
      actions.indexOf("export async function resetRouterDevice"),
    );
    assert.match(bloc, /removeCloudMikhmonInstance\(routerId\)/);
  });
});
