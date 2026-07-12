import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { portalThemeFromParams, portalThemeSearch } from "./theme";

describe("portal theme", () => {
  it("keeps valid portal palette values", () => {
    assert.deepEqual(
      portalThemeFromParams({ accent: "#1144AA", surface: "#112233", text: "#F8FAFC" }),
      { accent: "#1144aa", surface: "#112233", text: "#f8fafc" },
    );
  });

  it("falls back when a palette value is unsafe", () => {
    assert.equal(portalThemeFromParams({ accent: "url(javascript:alert(1))" }).accent, "#0f766e");
  });

  it("serializes a palette for hosted portal URLs", () => {
    assert.equal(
      portalThemeSearch(portalThemeFromParams({ accent: "#1144aa" })),
      "accent=%231144aa&surface=%23ffffff&text=%230f172a",
    );
  });
});
