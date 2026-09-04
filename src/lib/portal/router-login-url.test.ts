import test from "node:test";
import assert from "node:assert/strict";
import { choisirHoteLogin, completerHoteLogin } from "./router-login-url";

test("l'IP de la passerelle passe avant le nom de domaine du portail", () => {
  assert.equal(
    choisirHoteLogin({ dnsName: "yahya.ci", hotspotAddress: "10.0.0.1" }),
    "10.0.0.1",
  );
});

test("sans IP connue, le dns-name reste mieux que rien", () => {
  assert.equal(choisirHoteLogin({ dnsName: "yahya.ci", hotspotAddress: "" }), "yahya.ci");
  assert.equal(choisirHoteLogin({ dnsName: "yahya.ci", hotspotAddress: undefined }), "yahya.ci");
});

test("aucun hôte exploitable : l'appelant retombe sur la saisie manuelle", () => {
  assert.equal(choisirHoteLogin(null), null);
  assert.equal(choisirHoteLogin({ dnsName: "  ", hotspotAddress: "  " }), null);
});

test("un routeur qui n'avait que son dns-name reçoit enfin son IP", () => {
  const merged = completerHoteLogin(
    { dnsName: "yahya.ci", ssid: "YAHYA WIFI" },
    { dnsName: "yahya.ci", hotspotAddress: "10.0.0.1" },
  );
  assert.deepEqual(merged, { dnsName: "yahya.ci", ssid: "YAHYA WIFI", hotspotAddress: "10.0.0.1" });
});

test("ce que l'assistant a écrit n'est jamais remplacé", () => {
  assert.equal(
    completerHoteLogin(
      { dnsName: "yahya.ci", hotspotAddress: "10.0.0.1" },
      { dnsName: "autre.ci", hotspotAddress: "192.168.88.1" },
    ),
    null,
  );
});

test("rien de lisible sur le routeur : aucune écriture", () => {
  assert.equal(completerHoteLogin(null, { dnsName: null, hotspotAddress: "  " }), null);
});
