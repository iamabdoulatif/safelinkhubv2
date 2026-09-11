import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PORTAL_MIN_NEW_DEVICES, assessPortalHealth } from "./hotspot-portal-health";

/* Lignes telles que RouterOS les écrit — dont la variante « ->: » qui double
   chacune. Ce sont celles de HSPT-FOUANGA, le 11/09/2026. */
const macFail = (mac: string, ip = "10.1.36.95") => [
  `${mac} (${ip}): trying to log in by mac`,
  `->: ${mac} (${ip}): trying to log in by mac`,
  `${mac} (${ip}): login failed: invalid username or password`,
  `->: ${mac} (${ip}): login failed: invalid username or password`,
];
const cookie = (user: string) => [
  `${user} (10.1.36.154): trying to log in by mac-cookie`,
  `->: ${user} (10.1.36.154): trying to log in by mac-cookie`,
  `${user} (10.1.36.153): logged in`,
];
const form = (user: string, methode = "http-chap") => [
  `${user} (10.1.36.69): trying to log in by ${methode}`,
  `->: ${user} (10.1.36.69): trying to log in by ${methode}`,
  `${user} (10.1.36.67): logged in`,
];
const mac = (i: number) => `B6:81:93:56:ED:${i.toString(16).padStart(2, "0").toUpperCase()}`;

describe("portail invisible : la signature dans le journal", () => {
  it("FOUANGA : des nouveaux appareils, aucun formulaire → suspect", () => {
    const lignes = [
      ...Array.from({ length: 24 }, (_, i) => macFail(mac(i))).flat(),
      ...Array.from({ length: 30 }, (_, i) => cookie(`1s${i}`)).flat(),
    ];
    const h = assessPortalHealth(lignes);
    assert.equal(h.newDevices, 24);
    assert.equal(h.formLogins, 0);
    assert.equal(h.cookieLogins, 30);
    assert.equal(h.verdict, "suspect");
  });

  it("un seul formulaire soumis suffit à innocenter le portail", () => {
    const lignes = [
      ...Array.from({ length: 24 }, (_, i) => macFail(mac(i))).flat(),
      ...form("4j276382"),
    ];
    assert.equal(assessPortalHealth(lignes).verdict, "ok");
    assert.equal(assessPortalHealth([...lignes, ...form("abass", "http-pap")]).formLogins, 2);
  });

  it("trop peu de nouveaux appareils : on ne tranche pas", () => {
    const lignes = Array.from({ length: PORTAL_MIN_NEW_DEVICES - 1 }, (_, i) => macFail(mac(i))).flat();
    assert.equal(assessPortalHealth(lignes).verdict, "unknown");
    assert.equal(assessPortalHealth([]).verdict, "unknown");
  });

  it("le même appareil qui ré-essaie ne compte qu'une fois", () => {
    // Un téléphone sonde toutes les 20 s : sans dédoublonnage, un seul
    // appareil insistant ferait franchir le seuil.
    const lignes = Array.from({ length: 40 }, () => macFail(mac(1))).flat();
    assert.equal(assessPortalHealth(lignes).newDevices, 1);
    assert.equal(assessPortalHealth(lignes).verdict, "unknown");
  });

  it("un ticket mal tapé n'est pas un nouvel appareil", () => {
    // L'échec porte un code, pas une adresse MAC : c'est un humain qui se
    // trompe, la page est donc atteinte — ça ne doit pas nourrir le verdict.
    const lignes = Array.from({ length: 20 }, (_, i) => [
      `abcd${i} (10.1.36.10): trying to log in by http-chap`,
      `abcd${i} (10.1.36.10): login failed: invalid username or password`,
    ]).flat();
    const h = assessPortalHealth(lignes);
    assert.equal(h.newDevices, 0);
    assert.equal(h.formLogins, 20);
    assert.equal(h.verdict, "ok");
  });
});
