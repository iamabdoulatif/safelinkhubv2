import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUnsupportedEnvlistError,
  withoutEnvlist,
} from "./container-envlist";

describe("RouterOS envlist compatibility", () => {
  it("retries only when RouterOS explicitly rejects envlist", () => {
    assert.equal(isUnsupportedEnvlistError("unknown parameter envlist"), true);
    assert.equal(isUnsupportedEnvlistError(" unknown parameter envlist "), true);
    assert.equal(isUnsupportedEnvlistError("unknown parameter root-dir"), false);
    assert.equal(isUnsupportedEnvlistError("unknown parameter envlisting"), false);
    assert.equal(isUnsupportedEnvlistError("failed: unknown parameter envlist"), false);
    assert.equal(isUnsupportedEnvlistError("permission denied"), false);
  });

  it("removes only the envlist argument from a rejected container command", () => {
    const command = [
      "/container/add",
      "=interface=MIKHMON",
      "=envlist=mikhmon",
      "=root-dir=tmp/mikhmon-app",
    ];

    assert.deepEqual(withoutEnvlist(command), [
      "/container/add",
      "=interface=MIKHMON",
      "=root-dir=tmp/mikhmon-app",
    ]);
  });
});
