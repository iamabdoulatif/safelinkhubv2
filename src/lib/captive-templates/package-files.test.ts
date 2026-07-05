import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autoParameterizePortalFiles,
  renderPackageFile,
  type PackageFile,
} from "./package-files";

const GOLD_LIKE_LOGIN: PackageFile = {
  path: "login.html",
  encoding: "utf8",
  content: `<html><body>
  <div class="brand-title">$(hostname)</div>
  <div class="promo-banner">
    <span class="promo-banner-label">Forfait dès</span>
    <span class="promo-banner-price">100 FCFA</span>
  </div>
  <div class="plans-grid">
    <div class="plan-card"><div class="plan-name">05 Heures</div><div class="plan-price"><span class="currency">F</span>100</div></div>
    <div class="plan-card"><div class="plan-name">01 Jour</div><div class="plan-price"><span class="currency">F</span>200</div></div>
  </div>
  <div class="footer"><a href="tel:+1234567890">Appelez-nous</a></div>
</body></html>`,
};

describe("autoParameterizePortalFiles", () => {
  it("swaps hostname, hardcoded plans, promo price and tel links for placeholders", () => {
    const { files, substitutions } = autoParameterizePortalFiles([GOLD_LIKE_LOGIN]);
    const html = files[0].content;

    assert.ok(html.includes("{{SSID}}"));
    assert.ok(!html.includes("$(hostname)"));
    assert.ok(html.includes("{{PLANS_HTML}}"));
    assert.ok(!html.includes("05 Heures"), "hardcoded plan cards must be gone");
    assert.ok(html.includes("{{MIN_PLAN_PRICE}}"));
    assert.ok(html.includes('href="{{SUPPORT_PHONE_TEL}}"'));
    // The grid wrapper itself must survive (only its contents are replaced).
    assert.ok(html.includes('<div class="plans-grid">'));
    assert.equal(substitutions.length, 4);
  });

  it("leaves non-HTML and binary files untouched", () => {
    const css: PackageFile = { path: "css/style.css", encoding: "utf8", content: ".plan-card{}" };
    const img: PackageFile = { path: "img/x.png", encoding: "base64", content: "aGk=" };
    const { files } = autoParameterizePortalFiles([css, img]);
    assert.deepEqual(files, [css, img]);
  });

  it("does not re-replace files that already carry placeholders", () => {
    const authored: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<div class="plans-grid">{{PLANS_HTML}}<div class="plan-card"></div></div>',
    };
    const { files } = autoParameterizePortalFiles([authored]);
    assert.equal(files[0].content, authored.content);
  });
});

describe("renderPackageFile", () => {
  it("renders plans, min price and support phone into the placeholders", () => {
    const { files } = autoParameterizePortalFiles([GOLD_LIKE_LOGIN]);
    const body = renderPackageFile(files[0], {
      ssid: "MIRADOR-WIFI",
      supportPhone: "+225 07 08 09 10 11",
      plans: [
        { name: "3j", priceCents: 500, durationValue: 3, durationUnit: "Days" },
        { name: "1s", priceCents: 700, durationValue: 1, durationUnit: "Weeks" },
      ],
    }).toString("utf8");

    assert.ok(body.includes("MIRADOR-WIFI"));
    assert.ok(body.includes("03 Jours"));
    assert.ok(body.includes("01 Semaine"));
    assert.ok(body.includes('data-price-cents="500"'));
    assert.ok(body.includes('data-price="500 FCFA"'));
    assert.ok(body.includes("500 FCFA"), "min plan price rendered");
    assert.ok(body.includes('href="tel:+22507080910111"') || body.includes('href="tel:+2250708091011"'));
    assert.ok(!body.includes("{{"), "no unreplaced placeholder left");
  });

  it("renders the Yahya price-card family into {{PRICE_CARDS_HTML}} with a safe onclick arg", () => {
    const file: PackageFile = {
      path: "login.html",
      encoding: "utf8",
      content: '<div class="pricing-section">{{PRICE_CARDS_HTML}}</div>',
    };
    const body = renderPackageFile(file, {
      ssid: "X",
      plans: [
        { name: "Forfait 1 Jour", priceCents: 200, durationValue: 1, durationUnit: "Days" },
        { name: "L'Hebdo", priceCents: 700, durationValue: 1, durationUnit: "Weeks" },
      ],
    }).toString("utf8");

    assert.equal((body.match(/<div class="price-card">/g) ?? []).length, 2);
    assert.ok(body.includes("<h3>Forfait 01 Jour</h3>"));
    assert.ok(body.includes("<h3>Forfait 01 Semaine</h3>"));
    assert.ok(body.includes('<span class="price-amount">200 F</span>'));
    // a plan name with a single quote must not break the JS string literal
    assert.ok(body.includes("openPhoneModal('L\\'Hebdo')"));
    // every card gets a coloured badge class (base .price-duration-badge has no default background)
    assert.ok(!/price-duration-badge\s*"/.test(body), "each badge carries a colour class");
    assert.ok(!body.includes("{{"), "no unreplaced placeholder left");
  });
});
