import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const englishPages = [
  ["../src/app/en/blog/page.tsx", "BlogPageContent"],
  ["../src/app/en/blog/[slug]/page.tsx", "BlogPostPageContent"],
  ["../src/app/en/contact/page.tsx", "ContactPageContent"],
  ["../src/app/en/boutique/page.tsx", "BoutiquePageContent"],
];

test("public English routes reuse their translated page content", () => {
  for (const [relativePath, component] of englishPages) {
    const file = fileURLToPath(new URL(relativePath, import.meta.url));
    assert.equal(existsSync(file), true, `${relativePath} must exist`);
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(`<${component}[^>]*locale="en"`));
  }
});

test("every published public page is eligible for an English locale link", () => {
  const config = readFileSync(
    fileURLToPath(new URL("../src/lib/i18n/config.ts", import.meta.url)),
    "utf8",
  );

  for (const route of ["/blog", "/contact", "/boutique"]) {
    assert.match(config, new RegExp(`"${route}"`));
  }
});
