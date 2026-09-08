import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUDGET_ROTATION_MS,
  rotateApiPassword,
  type RotationDeps,
} from "./api-password-rotation";
import { noteSansAvertissement } from "./router-transfer";

/** Routeur simulé : `valide` est le mot de passe que la carte accepte. */
function faux(opts: { valide: string; poseEchoue?: boolean; tunnelTombeApresPose?: boolean }) {
  const journal: string[] = [];
  let valide = opts.valide;
  let enregistre: string | null = null;
  const deps: RotationDeps = {
    poser: async (mdp) => {
      journal.push("poser");
      if (opts.poseEchoue) throw new Error("le routeur a refusé");
      valide = mdp;
    },
    ouvre: async (mdp) => {
      journal.push("ouvre");
      if (opts.tunnelTombeApresPose) return false;
      return mdp === valide;
    },
    enregistrer: async (mdp) => {
      journal.push("enregistrer");
      enregistre = mdp;
    },
  };
  return { deps, journal, lu: () => enregistre };
}

describe("renouvellement du mot de passe API", () => {
  it("enregistre le nouveau une fois que le routeur l'a confirmé", async () => {
    const f = faux({ valide: "ancien" });
    const v = await rotateApiPassword(f.deps, { ancien: "ancien", nouveau: "nouveau" });
    assert.equal(v.ok, true);
    assert.equal(f.lu(), "nouveau");
    // Vérifié AVANT d'écrire en base : une base en avance sur le routeur est
    // exactement ce qui rend la carte injoignable.
    assert.ok(f.journal.indexOf("ouvre") < f.journal.indexOf("enregistrer"));
  });

  it("ne touche pas à la base quand la pose échoue", async () => {
    const f = faux({ valide: "ancien", poseEchoue: true });
    const v = await rotateApiPassword(f.deps, { ancien: "ancien", nouveau: "nouveau" });
    assert.equal(v.ok, false);
    assert.equal(f.lu(), null);
    assert.deepEqual(f.journal, ["poser"]);
  });

  it("garde l'ancien quand le routeur n'a pas pris le nouveau", async () => {
    const f = faux({ valide: "ancien" });
    // Pose muette : le routeur répond OK mais garde son mot de passe.
    f.deps.poser = async () => {};
    const v = await rotateApiPassword(f.deps, { ancien: "ancien", nouveau: "nouveau" });
    assert.equal(v.ok, false);
    assert.equal(f.lu(), null, "la base doit rester sur le mot de passe qui ouvre");
  });

  it("parie sur le nouveau quand plus aucun des deux n'ouvre", async () => {
    /* Le tunnel a lâché entre la pose et la vérification. Enregistrer l'ancien
       laisserait la base fausse si la pose avait pris — donc injoignable. */
    const f = faux({ valide: "ancien", tunnelTombeApresPose: true });
    const v = await rotateApiPassword(f.deps, { ancien: "ancien", nouveau: "nouveau" });
    assert.equal(v.ok, false);
    assert.match(v.ok === false ? v.error : "", /non vérifié/);
    assert.equal(f.lu(), "nouveau");
  });

  it("n'écrit jamais deux fois sur le routeur", async () => {
    for (const cas of [
      faux({ valide: "ancien" }),
      faux({ valide: "ancien", tunnelTombeApresPose: true }),
    ]) {
      await rotateApiPassword(cas.deps, { ancien: "ancien", nouveau: "nouveau" });
      assert.equal(cas.journal.filter((e) => e === "poser").length, 1);
    }
  });
});

describe("la note du superadmin après un renouvellement", () => {
  it("retire l'avertissement du passage précédent", () => {
    assert.equal(
      noteSansAvertissement("Transfert au client — ⚠ mot de passe API non renouvelé (hors ligne)"),
      "Transfert au client",
    );
  });

  it("est idempotente — rejouer trois fois ne laisse pas trois avertissements", () => {
    let note = "Transfert au client";
    for (let i = 0; i < 3; i++) {
      note = `${noteSansAvertissement(note)} — ⚠ échec ${i}`;
    }
    assert.equal(noteSansAvertissement(note), "Transfert au client");
    assert.equal(note.split("⚠").length - 1, 1, "un seul avertissement à la fois");
  });

  it("laisse intacte une note qui n'en porte pas", () => {
    assert.equal(noteSansAvertissement("Transfert au client"), "Transfert au client");
    assert.equal(noteSansAvertissement(null), "");
  });
});

describe("le budget du renouvellement", () => {
  it("rend la main avant la coupure de Cloudflare", () => {
    /* Le superadmin ATTEND ce verdict : la requête doit finir. Avec les
       reprises par défaut de connectToRouter (3 × 20 s, trois fois), un routeur
       hors ligne consommait jusqu'à 180 s — coupés à 100 s, donc aucun verdict,
       aucune note, et un bouton qui semble ne rien faire. Constaté en prod. */
    assert.ok(
      BUDGET_ROTATION_MS < 100_000,
      `budget hors bornes : ${BUDGET_ROTATION_MS} ms`,
    );
  });

  it("laisse de la marge pour les appels API entre les ouvertures", () => {
    assert.ok(BUDGET_ROTATION_MS < 60_000, `trop juste : ${BUDGET_ROTATION_MS} ms`);
  });
});
