import assert from "node:assert/strict";
import test from "node:test";
import { originLabel, ticketState } from "./voucher-state";

const now = 1_000_000;

test("l'état se lit sur la connexion et l'échéance, pas sur PROVISIONED", () => {
  assert.equal(ticketState({ status: "PROVISIONED", expiresAtMs: null, firstLogin: "—" }, now), "unused");
  assert.equal(ticketState({ status: "PROVISIONED", expiresAtMs: now + 1, firstLogin: "01/09/2026" }, now), "running");
  assert.equal(ticketState({ status: "PROVISIONED", expiresAtMs: now - 1, firstLogin: "01/09/2026" }, now), "expired");
  // Suspendu l'emporte sur tout : c'est ce qui explique un code refusé.
  assert.equal(ticketState({ status: "SUSPENDED", expiresAtMs: now + 1, firstLogin: "x" }, now), "suspended");
});

test("l'origine est traduite, l'inconnu reste lisible", () => {
  assert.equal(originLabel("Portal Sale"), "Vente portail");
  assert.equal(originLabel("Imported CSV"), "Importé");
  assert.equal(originLabel("Roaming Named User"), "Compte roaming");
  assert.equal(originLabel("Autre chose"), "Autre chose");
});
