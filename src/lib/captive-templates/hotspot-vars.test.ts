import test from "node:test";
import assert from "node:assert/strict";
import { simulateHotspotPage } from "./hotspot-vars";

test("l'aperçu rejoue les variables MikroTik au lieu de les afficher en clair", () => {
  const html = `<form action="$(link-login-only)">$(if error)<p>$(error)</p>$(endif)$(if chap-id)<script>x</script>$(else)<i>ok</i>$(endif)<h1>$(identity)</h1></form>`;
  assert.equal(
    simulateHotspotPage(html, { identity: "HSPT-FOUANGA" }),
    `<form action="#"><i>ok</i><h1>HSPT-FOUANGA</h1></form>`,
  );
});

test("les blocs imbriqués sont résolus", () => {
  assert.equal(simulateHotspotPage("a$(if x)b$(if y)c$(endif)d$(endif)e", { identity: "" }), "ae");
});
