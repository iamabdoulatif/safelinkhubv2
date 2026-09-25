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

  it("la ligne ovpn-client n'emploie que des paramètres connus de RouterOS 6", () => {
    /* Deuxième panne observée, sur MALO-HOTSPOT (6.49) : « expected end of
       command (line 6 column 92) ». La colonne 92 est le `=` de `protocol=tcp`
       — paramètre apparu en RouterOS 7 avec l'UDP. En 6.x le client est
       toujours en TCP et ne connaît pas ce mot. */
    const ligne = script.split("\n").find((l) => l.startsWith("/interface ovpn-client add "))!;
    const v6 = new Set([
      "name", "connect-to", "port", "mode", "user", "password", "profile", "certificate",
      "cipher", "auth", "add-default-route", "mac-address", "max-mtu", "disabled",
      "verify-server-certificate", "comment",
    ]);
    const cles = [...ligne.matchAll(/ ([a-z-]+)=/g)].map((m) => m[1]);
    assert.deepEqual(cles.filter((k) => !v6.has(k)), [], `paramètres inconnus de RouterOS 6 : ${ligne}`);
    assert.ok(!/protocol=/.test(script), "le client OVPN de la 6.x est toujours en TCP, sans paramètre");
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
