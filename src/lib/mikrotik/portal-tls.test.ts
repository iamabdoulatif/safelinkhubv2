import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectPortalTls,
  portalTlsBroken,
  portalTlsDetail,
  portalTlsRepairCommands,
} from "./portal-tls";

const serveurs = [{ ".id": "*1", profile: "hsprof1", disabled: "false" }];

test("un portail servi en clair n'a rien à corriger", () => {
  const state = inspectPortalTls(
    serveurs,
    [{ ".id": "*A", name: "hsprof1", "login-by": "cookie,http-chap,http-pap", "ssl-certificate": "none" }],
    [{ ".id": "*S", name: "www-ssl", disabled: "true", port: "443" }],
  );
  assert.equal(portalTlsBroken(state), false);
  assert.deepEqual(portalTlsRepairCommands(state), []);
});

test("un certificat sur le profil hotspot est le défaut, même sans https dans login-by", () => {
  const state = inspectPortalTls(
    serveurs,
    [{ ".id": "*A", name: "hsprof1", "login-by": "cookie,http-chap", "ssl-certificate": "hotspot-cert" }],
    [],
  );
  assert.equal(portalTlsBroken(state), true);
  assert.match(portalTlsDetail(state), /hotspot-cert/);
  assert.deepEqual(portalTlsRepairCommands(state), [
    ["/ip/hotspot/profile/set", "=numbers=*A", "=ssl-certificate=none", "=login-by=cookie,http-chap"],
  ]);
});

test("https retiré de login-by, les autres méthodes gardées", () => {
  const state = inspectPortalTls(
    serveurs,
    [{ ".id": "*A", name: "hsprof1", "login-by": "cookie,https,http-chap,mac-cookie" }],
    [],
  );
  assert.equal(state.profiles[0].loginByHttp, "cookie,http-chap,mac-cookie");
});

test("un profil qui n'aurait plus aucune méthode retombe sur le jeu par code", () => {
  const state = inspectPortalTls(serveurs, [{ ".id": "*A", name: "hsprof1", "login-by": "https" }], []);
  assert.equal(state.profiles[0].loginByHttp, "cookie,http-chap,http-pap");
});

test("www-ssl allumé répond en 443 avec le certificat du routeur : à éteindre", () => {
  const state = inspectPortalTls(
    serveurs,
    [{ ".id": "*A", name: "hsprof1", "login-by": "cookie,http-chap" }],
    [{ ".id": "*S", name: "www-ssl", disabled: "false", port: "443" }],
  );
  assert.equal(portalTlsBroken(state), true);
  assert.deepEqual(portalTlsRepairCommands(state), [
    ["/ip/service/set", "=numbers=*S", "=disabled=yes"],
  ]);
});

test("un profil hotspot orphelin (serveur désactivé) ne sert aucune page", () => {
  const state = inspectPortalTls(
    [{ ".id": "*1", profile: "hsprof1", disabled: "true" }],
    [{ ".id": "*A", name: "hsprof1", "ssl-certificate": "hotspot-cert" }],
    [],
  );
  assert.equal(portalTlsBroken(state), false);
});
