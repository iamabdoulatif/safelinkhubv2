import test from "node:test";
import assert from "node:assert/strict";
import { signPreviewToken, verifyPreviewToken } from "./preview-token";

const c = { templateId: "t", routerId: "r", orgId: "o" };

test("un jeton signé se vérifie, puis expire", () => {
  const tok = signPreviewToken(c, "s", 1000);
  assert.deepEqual(verifyPreviewToken(tok, "s", 2000), { ...c, exp: 1000 + 3600_000 });
  assert.equal(verifyPreviewToken(tok, "s", 1000 + 3600_001), null);
});

test("un jeton falsifié ou signé avec un autre secret est refusé", () => {
  const tok = signPreviewToken(c, "s", 0);
  const [p, sig] = tok.split(".");
  const autre = Buffer.from(JSON.stringify({ ...c, orgId: "pirate", exp: 9e15 })).toString("base64url");
  assert.equal(verifyPreviewToken(`${autre}.${sig}`, "s", 0), null);
  assert.equal(verifyPreviewToken(tok, "autre", 0), null);
  assert.equal(verifyPreviewToken(`${p}.`, "s", 0), null);
  assert.equal(verifyPreviewToken(tok, "", 0), null);
});
