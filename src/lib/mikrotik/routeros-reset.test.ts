import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESET_MODES, isResetMode, resetCommand, resetModeSpec } from "./routeros-reset";

describe("modes de réinitialisation RouterOS", () => {
  it("usine = efface tout, aucun défaut", () => {
    assert.deepEqual(resetCommand("factory"), ["/system/reset-configuration", "=no-defaults=yes"]);
  });

  it("keep-users = garde les comptes", () => {
    assert.deepEqual(resetCommand("keep-users"), [
      "/system/reset-configuration",
      "=no-defaults=yes",
      "=keep-users=yes",
    ]);
  });

  it("defaults = repose la config d'usine MikroTik (sans no-defaults)", () => {
    assert.deepEqual(resetCommand("defaults"), ["/system/reset-configuration"]);
  });

  it("valide les clés de mode et retombe sur un mode sûr", () => {
    assert.equal(isResetMode("factory"), true);
    assert.equal(isResetMode("tchoin"), false);
    assert.equal(isResetMode(undefined), false);
    // mode inconnu → premier mode (usine), jamais un reset « avec défauts » surprise
    assert.equal(resetModeSpec("wat" as never).key, RESET_MODES[0].key);
  });
});
