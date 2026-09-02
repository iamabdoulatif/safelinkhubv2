import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addressListWithContainer,
  inspectApiService,
  ipv4InPrefix,
  parseServiceAddressList,
  MIKHMON_EXPECTED_API_PORT,
} from "./api-service-access";

/* La liste relevée sur un routeur sain, telle que l'auto-setup l'écrit. */
const SAINE = { name: "api", disabled: "false", port: "8728", address: "10.66.0.0/24,11.11.11.0/28" };
/* Le cas SHIAH WIFI : le tunnel est là (SafeLinkHub voit le routeur), le
   conteneur ne l'est plus → MikHmon affiche « Not Connected ». */
const SANS_CONTENEUR = { name: "api", disabled: "false", port: "8728", address: "10.66.0.0/24" };

describe("appartenance à un préfixe", () => {
  it("reconnaît un préfixe, une adresse nue et le joker", () => {
    assert.equal(ipv4InPrefix("11.11.11.11", "11.11.11.0/28"), true);
    assert.equal(ipv4InPrefix("11.11.11.11", "10.66.0.0/24"), false);
    // Une entrée sans masque vaut /32 : elle ne couvre qu'elle-même.
    assert.equal(ipv4InPrefix("10.66.0.1", "10.66.0.1"), true);
    assert.equal(ipv4InPrefix("10.66.0.2", "10.66.0.1"), false);
    assert.equal(ipv4InPrefix("11.11.11.11", "0.0.0.0/0"), true);
  });

  it("la limite du /28 est exacte des deux côtés", () => {
    // 11.11.11.0/28 s'arrête à .15 — un conteneur en .16 n'est PAS couvert.
    assert.equal(ipv4InPrefix("11.11.11.15", "11.11.11.0/28"), true);
    assert.equal(ipv4InPrefix("11.11.11.16", "11.11.11.0/28"), false);
  });

  it("refuse ce qui n'est pas une adresse plutôt que de dire oui", () => {
    assert.equal(ipv4InPrefix("11.11.11.11", "pas-une-adresse"), false);
    assert.equal(ipv4InPrefix("11.11.11.11", "11.11.11.0/33"), false);
    assert.equal(ipv4InPrefix("999.1.1.1", "0.0.0.0/0"), false);
  });
});

describe("lecture de la liste address=", () => {
  it("découpe, nettoie et ignore le vide", () => {
    assert.deepEqual(parseServiceAddressList("10.66.0.0/24, 11.11.11.0/28"), [
      "10.66.0.0/24",
      "11.11.11.0/28",
    ]);
    assert.deepEqual(parseServiceAddressList(""), []);
    assert.deepEqual(parseServiceAddressList(undefined), []);
  });
});

describe("verdict sur le service API", () => {
  it("un routeur sain laisse passer le conteneur", () => {
    const c = inspectApiService(SAINE, "11.11.11.11")!;
    assert.equal(c.reachableFromContainer, true);
    assert.equal(c.disabled, false);
    assert.equal(c.portMismatch, false);
  });

  it("détecte la liste qui a perdu le conteneur — le cas « Not Connected »", () => {
    const c = inspectApiService(SANS_CONTENEUR, "11.11.11.11")!;
    assert.equal(c.restricted, true);
    assert.equal(c.reachableFromContainer, false);
  });

  it("une liste vide n'est pas une restriction : tout passe", () => {
    const c = inspectApiService({ name: "api", disabled: "false", port: "8728" }, "11.11.11.11")!;
    assert.equal(c.restricted, false);
    assert.equal(c.reachableFromContainer, true);
  });

  it("signale une API déplacée hors de 8728", () => {
    const c = inspectApiService({ ...SAINE, port: "8729" }, "11.11.11.11")!;
    assert.equal(c.portMismatch, true);
    assert.equal(MIKHMON_EXPECTED_API_PORT, 8728);
  });

  it("couvre un conteneur posé ailleurs que sur la veth SafeLinkHub", () => {
    // Cas SHIA-HSPT : MikHmon installé à la main sur une autre veth.
    assert.equal(inspectApiService(SAINE, "172.17.0.2")!.reachableFromContainer, false);
  });

  it("service absent = pas de verdict inventé", () => {
    assert.equal(inspectApiService(undefined, "11.11.11.11"), null);
  });
});

describe("réparation de la liste", () => {
  it("ajoute le conteneur SANS retirer le tunnel", () => {
    // Réécrire la liste de zéro couperait la connexion qui applique le
    // correctif : le tunnel doit survivre intact.
    const after = addressListWithContainer(["10.66.0.0/24"], "11.11.11.11");
    assert.equal(after, "10.66.0.0/24,11.11.11.11/32");
    assert.ok(after.startsWith("10.66.0.0/24"));
    assert.equal(inspectApiService({ address: after }, "11.11.11.11")!.reachableFromContainer, true);
    assert.equal(inspectApiService({ address: after }, "10.66.0.9")!.reachableFromContainer, true);
  });
});
