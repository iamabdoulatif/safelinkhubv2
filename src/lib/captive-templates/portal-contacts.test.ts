import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSafelinkBarakaPackage,
  loadSafelinkhubDefaultPackage,
  loadYahyaWifiPackage,
  renderPackageFile,
} from "./package-files";

const vars = {
  ssid: "ZONE",
  supportWhatsapp: "+225 07 11 22 33 44",
  supportPhone: "+225 05 99 88 77 66",
  vendors: [{ name: "Awa", location: "Marché central", phone: "+225 01 23 45 67 89" }],
  plans: [],
  appUrl: "https://safelinkhub.io",
  slug: "demo",
  routerId: "r1",
  countryIso2: "CI",
  dialCode: "225",
};

for (const [name, load] of [
  ["Baraka", loadSafelinkBarakaPackage],
  ["SafeLinkHub", loadSafelinkhubDefaultPackage],
  ["Yahya", loadYahyaWifiPackage],
] as const) {
  test(`${name} : les contacts du routeur apparaissent sur le portail`, () => {
    const login = load().find((f) => f.path === "login.html")!;
    const html = renderPackageFile(login, vars).toString();
    assert.match(html, /05 99 88 77 66|07 11 22 33 44/, "le numéro de support doit apparaître");
    assert.match(html, /Awa/, "le vendeur doit apparaître");
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/, "aucun emplacement non remplacé");
  });
}

test("Yahya ne porte plus de numéro ni de vendeur en dur", () => {
  const login = loadYahyaWifiPackage().find((f) => f.path === "login.html")!.content;
  assert.doesNotMatch(login, /01 51 74 48 57/);
  assert.doesNotMatch(login, /Hassatou/);
});
