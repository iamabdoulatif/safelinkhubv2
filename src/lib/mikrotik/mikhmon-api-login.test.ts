import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectMikhmonApiLogins } from "./mikhmon-api-login";

const CONTENEUR = "11.11.11.11";
const TUNNEL = "10.66.0.1";

const echec = (time: string, from = CONTENEUR) => ({
  time,
  message: `login failure for user safelinkhub-api from ${from} via api`,
});
const succes = (time: string, from = CONTENEUR) => ({
  time,
  message: `user safelinkhub-api logged in from ${from} via api`,
});
/* Le journal d'un routeur de hotspot est saturé de ces lignes-là. */
const bruit = { time: "02:57:07", message: "->: 1se9t7 (10.0.0.26): logged in" };

describe("verdict sur les connexions API du conteneur", () => {
  it("relève le rejet et son compte — le cas KONGASSO-HTSPT", () => {
    const v = inspectMikhmonApiLogins(
      [bruit, succes("05:46:47", TUNNEL), echec("05:50:46"), echec("05:50:49"), bruit],
      CONTENEUR,
    );
    assert.equal(v.state, "rejected");
    if (v.state !== "rejected") return;
    assert.equal(v.user, "safelinkhub-api");
    assert.equal(v.at, "05:50:49");
    assert.equal(v.failures, 2);
  });

  it("une réussite du TUNNEL ne blanchit pas le conteneur", () => {
    // Le piège du diagnostic : l'app se connecte très bien, en même temps.
    const v = inspectMikhmonApiLogins([echec("05:50:49"), succes("05:51:00", TUNNEL)], CONTENEUR);
    assert.equal(v.state, "rejected");
  });

  it("après réparation, la réussite efface les échecs du tampon", () => {
    // Le journal est circulaire : compter les lignes re-signalerait à tort un
    // routeur déjà réparé. C'est le dernier événement qui décide.
    const v = inspectMikhmonApiLogins(
      [echec("05:50:46"), echec("05:50:49"), succes("06:02:11")],
      CONTENEUR,
    );
    assert.equal(v.state, "ok");
    if (v.state !== "ok") return;
    assert.equal(v.at, "06:02:11");
  });

  it("une rechute après une réussite est bien signalée", () => {
    const v = inspectMikhmonApiLogins([succes("06:02:11"), echec("06:30:00")], CONTENEUR);
    assert.equal(v.state, "rejected");
    if (v.state !== "rejected") return;
    assert.equal(v.failures, 1);
  });

  it("journal muet ou sans rapport : aucun constat inventé", () => {
    assert.equal(inspectMikhmonApiLogins([], CONTENEUR).state, "unknown");
    assert.equal(inspectMikhmonApiLogins([bruit, bruit], CONTENEUR).state, "unknown");
    // Conteneur ailleurs que sur la veth SafeLinkHub : ces lignes ne sont pas les siennes.
    assert.equal(inspectMikhmonApiLogins([echec("05:50:49")], "172.17.0.2").state, "unknown");
  });
});
