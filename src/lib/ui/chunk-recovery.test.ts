import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleTentative, decisionReprise, estErreurDeFragment } from "./chunk-recovery";

describe("reconnaître un fragment manquant", () => {
  it("accepte les formes que produisent réellement les navigateurs", () => {
    /* Elles diffèrent selon le navigateur et la version de Next. Ne tester que
       `name === "ChunkLoadError"` laisserait passer la moitié des cas — celle
       observée en local portait le nom, mais Firefox et Safari se contentent
       souvent du message. */
    const formes = [
      Object.assign(new Error("boom"), { name: "ChunkLoadError" }),
      new Error("Loading chunk 42 failed."),
      new Error("Failed to load chunk /_next/static/chunks/3xc5l00uhha4e.js from module 964893"),
      new Error("error loading dynamically imported module: /_next/static/chunks/x.js"),
      new Error("Importing a module script failed."),
    ];
    for (const e of formes) assert.equal(estErreurDeFragment(e), true, e.message);
  });

  it("ne prend PAS une erreur ordinaire pour un fragment manquant", () => {
    /* C'est la garde qui empêche la boucle : recharger sur une erreur de
       données ferait clignoter la page sans jamais aboutir. */
    for (const e of [
      new Error("Cannot read properties of undefined"),
      new Error("relation \"router_backups\" does not exist"),
      Object.assign(new Error("échec"), { digest: "1234567890" }),
      null,
      undefined,
      "chunk",
    ]) {
      assert.equal(estErreurDeFragment(e), false, String(e));
    }
  });
});

describe("décision de rechargement", () => {
  const chunk = Object.assign(new Error("boom"), { name: "ChunkLoadError" });

  it("recharge une fois, et une seule", () => {
    const d1 = decisionReprise(chunk, "/admin/router/backups", false);
    assert.equal(d1.recharger, true);
    assert.equal(d1.recharger === true && d1.cle, cleTentative("/admin/router/backups"));

    // Après la tentative, on laisse l'erreur s'afficher : elle n'est plus due
    // à un onglet périmé, et insister masquerait la vraie cause.
    const d2 = decisionReprise(chunk, "/admin/router/backups", true);
    assert.equal(d2.recharger, false);
    assert.equal(d2.recharger === false && d2.motif, "deja-tente");
  });

  it("ne recharge jamais sur une autre erreur", () => {
    const d = decisionReprise(new Error("base de données injoignable"), "/admin", false);
    assert.equal(d.recharger, false);
    assert.equal(d.recharger === false && d.motif, "autre-erreur");
  });

  it("la mémoire est propre à CHAQUE chemin", () => {
    /* Un rechargement déjà fait sur une page ne doit pas empêcher la reprise
       sur une autre : chaque route a ses propres fragments. */
    assert.notEqual(cleTentative("/admin/router/backups"), cleTentative("/admin/ventes"));
  });
});

describe("câblage dans le garde-fou de l'admin", () => {
  const source = async () => {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL("../../app/admin/error.tsx", import.meta.url), "utf8");
  };

  it("recharge le DOCUMENT, pas seulement le rendu", async () => {
    /* `reset()` refait le rendu avec le même bundle périmé, donc la même
       erreur. Il faut redemander le document au serveur pour obtenir les
       nouveaux noms de fragments. */
    const s = await source();
    assert.match(s, /window\.location\.reload\(\)/);
  });

  it("la tentative est MÉMORISÉE avant de recharger", async () => {
    /* Écrire après le rechargement ne servirait à rien : la page repart de
       zéro. Sans mémoire écrite avant, la boucle est garantie. */
    const s = await source();
    const bloc = s.slice(s.indexOf("const decision = decisionReprise"));
    assert.ok(
      bloc.indexOf("sessionStorage.setItem") < bloc.indexOf("window.location.reload"),
      "le rechargement précède la mémorisation",
    );
  });

  it("un stockage refusé fait RENONCER, pas recharger", async () => {
    /* En navigation privée, sessionStorage peut lever. Sans mémoire, l'unicité
       de la tentative n'est plus garantie : mieux vaut afficher l'erreur que
       risquer une page qui clignote sans fin. */
    const s = await source();
    const bloc = s.slice(s.indexOf("useEffect"), s.indexOf("return ("));
    const catches = [...bloc.matchAll(/catch \{[\s\S]{0,200}?return;/g)];
    assert.ok(catches.length >= 2, `renoncement manquant sur un catch (${catches.length})`);
  });
});
