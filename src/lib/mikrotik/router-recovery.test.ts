import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReplacementInstallCommand,
  canRetryReplacement,
  canStartRouterReplacement,
  formatVpnAccessWhatsappMessage,
  isReplacementAutoSetupRetry,
  replacementCompletionPlan,
  replacementStatusLabel,
} from "./router-recovery";

describe("reprise de routeur", () => {
  it("n'autorise qu'une reprise non terminée à être relancée", () => {
    assert.equal(canStartRouterReplacement(null), true);
    assert.equal(canStartRouterReplacement("pending"), false);
    assert.equal(canRetryReplacement("pending"), true);
    assert.equal(canRetryReplacement("installing"), false);
    assert.equal(canRetryReplacement("failed"), true);
  });

  it("hérite l'Auto-Setup seulement du même payeur", () => {
    assert.equal(isReplacementAutoSetupRetry("approved", "payer", "payer", "completed"), true);
    assert.equal(isReplacementAutoSetupRetry("approved", "payer", "payer", "failed"), true);
    assert.equal(isReplacementAutoSetupRetry("approved", "payer", "payer", "cancelled"), false);
    assert.equal(isReplacementAutoSetupRetry("approved", "payer", "other", "completed"), false);
    assert.equal(isReplacementAutoSetupRetry("pending", "payer", "payer", "completed"), false);
  });

  it("construit un script temporaire sans exporter de clé privée", () => {
    const command = buildReplacementInstallCommand(
      "https://app.example/api/router/v1/acme/scripts/install-vpn",
      "raw-token",
    );
    assert.match(command, /Authorization: Bearer raw-token/);
    assert.match(command, /dst-path="vpn\.rsc"/);
    assert.doesNotMatch(command, /PrivateKey/);
  });

  it("prévoit le transfert puis la révocation de l'ancien pair", () => {
    assert.deepEqual(replacementCompletionPlan("vpn"), [
      "replace-forwards",
      "move-records",
      "revoke-wireguard-peer",
      "complete",
    ]);
    assert.deepEqual(replacementCompletionPlan("openvpn"), [
      "replace-forwards",
      "move-records",
      "revoke-openvpn-peer",
      "complete",
    ]);
  });

  it("prépare un message support sans mot de passe par défaut", () => {
    const message = formatVpnAccessWhatsappMessage({
      routerName: "Site A",
      username: "safelinkhub-api",
      password: null,
      services: ["winbox"],
    });
    assert.match(message, /Site A/);
    assert.doesNotMatch(message, /undefined|null/);
  });

  it("affiche un état compréhensible pendant la préparation MikHmon", () => {
    assert.equal(replacementStatusLabel("installing", true), "Connexion du routeur de remplacement…");
    assert.equal(replacementStatusLabel("completed", true), "Préparation MikHmon requise");
  });
});
