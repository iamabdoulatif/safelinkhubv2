import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routes = [
  "login",
  "register",
  "activation",
  "activation-envoyee",
  "mot-de-passe-oublie",
  "reinitialiser",
];

test("all authentication screens have an English route wrapper", () => {
  for (const route of routes) {
    const file = fileURLToPath(new URL(`../src/app/en/auth/${route}/page.tsx`, import.meta.url));
    assert.equal(existsSync(file), true, `/en/auth/${route} must exist`);
    assert.match(readFileSync(file, "utf8"), /locale="en"/);
  }
});

test("the public navigation can keep visitors on English auth routes", () => {
  const config = readFileSync(
    fileURLToPath(new URL("../src/lib/i18n/config.ts", import.meta.url)),
    "utf8",
  );
  for (const route of ["/auth/login", "/auth/register", "/auth/activation", "/auth/reinitialiser"]) {
    assert.match(config, new RegExp(`"${route}"`));
  }
});
