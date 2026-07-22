import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isImportedVoucherUseCase } from "./source";

describe("origine d'un voucher", () => {
  it("reconnaît les imports Mikhmon et CSV historiques", () => {
    assert.equal(isImportedVoucherUseCase("Imported"), true);
    assert.equal(isImportedVoucherUseCase("Imported CSV"), true);
    assert.equal(isImportedVoucherUseCase(" imported (Mikhmon) "), true);
  });

  it("ne masque pas les tickets générés par SafeLinkHub", () => {
    assert.equal(isImportedVoucherUseCase("Batch Create"), false);
    assert.equal(isImportedVoucherUseCase("Portal Sale"), false);
    assert.equal(isImportedVoucherUseCase(null), false);
  });
});
