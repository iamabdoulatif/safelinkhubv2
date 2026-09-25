import test from "node:test";
import assert from "node:assert/strict";

import { createSessionToken, signMfaPendingToken, verifyMfaPendingToken, verifySessionToken } from "./session";

// Lue à chaque appel (getSecretKey), pas à l'import.
process.env.AUTH_SECRET = "secret-de-test";

const user = { userId: "u1", orgId: "o1", email: "a@b.c", name: "A", role: "admin" };

test("un jeton de session se vérifie", async () => {
  assert.deepEqual(await verifySessionToken(await createSessionToken(user)), user);
});

test("le jeton « MFA en attente » ne vaut JAMAIS une session", async () => {
  // Faille corrigée : signé avec la même clé et porteur des mêmes champs, il
  // passait pour une session complète — second facteur contourné.
  const mfa = await signMfaPendingToken({ ...user, callback: "/admin" });
  assert.equal(await verifySessionToken(mfa), null);
  assert.equal((await verifyMfaPendingToken(mfa))?.userId, "u1");
});

test("un jeton de session n'ouvre pas l'étape MFA", async () => {
  assert.equal(await verifyMfaPendingToken(await createSessionToken(user)), null);
});

test("un jeton falsifié est refusé", async () => {
  const tok = await createSessionToken(user);
  assert.equal(await verifySessionToken(tok.slice(0, -2) + "xx"), null);
});
