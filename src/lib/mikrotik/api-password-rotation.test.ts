import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rotateApiPassword, type RotationDeps } from "./api-password-rotation";

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
