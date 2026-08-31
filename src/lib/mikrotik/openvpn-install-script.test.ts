import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOpenvpnInstallScript, escapeRosString } from "./openvpn-install-script";

const script = buildOpenvpnInstallScript({
  connectTo: "31.97.153.83",
  port: "1194",
  username: "routeur-essai",
  password: "mdp",
  apiPassword: "mdp-api",
  callbackUrl: "https://safelinkhub.io/api/router/v1/org/scripts/install-openvpn/installed",
  callbackMode: "https",
  installToken: "jeton",
  identityName: "HSPT-ESSAI",
});

describe("compatibilité RouterOS 6 du script OpenVPN", () => {
  it("aucune commande n'utilise la syntaxe à slashs de RouterOS 7", () => {
    /* C'est LA panne observée : `/interface/ovpn-client/remove` fait répondre
       « expected command name (line 3 column 11) » à la 6.49.17 — la colonne
       11 étant le slash qui suit `/interface`. L'import s'arrête là et le
       routeur reste sans tunnel. */
    const fautives = script
      .split("\n")
      .filter((l) => /^\/[a-z0-9-]+\/[a-z0-9-]/.test(l.trim()));
    assert.deepEqual(fautives, [], `syntaxe RouterOS 7 : ${fautives.join(" | ")}`);
  });

  it("le tunnel est en TCP — la 6.x ne sait pas faire d'OVPN en UDP", () => {
    assert.match(script, /\/interface ovpn-client add .*protocol=tcp/);
    assert.ok(!/protocol=udp/.test(script), "UDP demandé à un client qui n'en fait pas");
  });

  it("le chiffrement est en CBC — pas d'AEAD avant RouterOS 7", () => {
    /* `aes256-gcm` n'existe pas en 6.x ; son `aes256` DÉSIGNE l'AES-256-CBC.
       Le serveur du relais annonce AES-256-CBC en plus de GCM pour que la
       négociation aboutisse. */
    assert.match(script, /cipher=aes256\b/);
    assert.ok(!/gcm/i.test(script), "chiffrement AEAD demandé à un client CBC");
  });

  it("l'authentification est celle que le serveur utilise par défaut", () => {
    // Le serveur n'a pas de directive `auth` : OpenVPN retombe sur SHA1, qui
    // est aussi le défaut de RouterOS 6. On l'écrit pour ne pas en dépendre.
    assert.match(script, /auth=sha1/);
  });

  it("les valeurs interpolées ne peuvent pas casser la chaîne RouterOS", () => {
    // Un guillemet dans le nom du routeur terminerait la chaîne et le reste de
    // la ligne deviendrait une commande.
    const piege = buildOpenvpnInstallScript({
      connectTo: "1.2.3.4",
      port: "1194",
      username: "u",
      password: "p",
      apiPassword: "a",
      callbackUrl: "https://x",
      callbackMode: "https",
      installToken: "t",
      identityName: 'HS"; /system reboot; :put "',
    });
    assert.ok(!/name="HS"; /.test(piege), "guillemet non échappé dans l'identité");
    assert.equal(escapeRosString('a"b\\c'), 'a\\"b\\\\c');
  });
});
