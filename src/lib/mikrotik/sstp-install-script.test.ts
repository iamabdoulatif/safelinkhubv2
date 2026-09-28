import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSstpInstallScript } from "./sstp-install-script";
import { TUNNEL_SUBNETS, isTunnelMethod, tunnelLabel } from "./tunnel-methods";

const script = buildSstpInstallScript({
  connectTo: "31.97.153.83",
  port: "443",
  username: "org-HSPT-ESSAI",
  password: "mdp",
  apiPassword: "mdp-api",
  tunnelSubnet: TUNNEL_SUBNETS.sstp,
  callbackUrl: "https://safelinkhub.io/api/router/v1/org/scripts/install-sstp/installed",
  callbackMode: "https",
  installToken: "jeton",
  identityName: "HSPT-ESSAI",
});
const ligne = script.split("\n").find((l) => l.startsWith("/interface sstp-client add "))!;

describe("script SSTP pour RouterOS 6", () => {
  it("aucune commande en syntaxe à slashs de RouterOS 7", () => {
    const fautives = script.split("\n").filter((l) => /^\/[a-z0-9-]+\/[a-z0-9-]/.test(l.trim()));
    assert.deepEqual(fautives, []);
  });

  it("la ligne sstp-client n'emploie que des paramètres connus de RouterOS 6", () => {
    const v6 = new Set([
      "name", "connect-to", "port", "user", "password", "profile", "authentication",
      "verify-server-certificate", "add-default-route", "disabled", "certificate",
      "http-proxy", "keepalive-timeout", "max-mtu", "max-mru", "mrru", "dial-on-demand", "comment",
    ]);
    const cles = [...ligne.matchAll(/ ([a-z-]+)=/g)].map((m) => m[1]);
    assert.deepEqual(cles.filter((k) => !v6.has(k)), [], ligne);
  });

  it("vise l'IP du relais sur le port 443 — sans nom, donc sans SNI", () => {
    /* Traefik ne renvoie vers le serveur SSTP que les connexions SANS SNI :
       un nom dans connect-to ferait envoyer un SNI à RouterOS 7.15+ et la
       connexion finirait sur le site web. */
    assert.match(ligne, /connect-to=31\.97\.153\.83 port=443 /);
  });

  it("l'API n'écoute que le tunnel SSTP et le réseau de MikHmon", () => {
    assert.match(script, /address=192\.168\.200\.0\/24,11\.11\.11\.0\/28/);
    assert.match(script, /available-from=192\.168\.200\.0\/24,11\.11\.11\.0\/28/);
  });

  it("ne redémarre pas le routeur (l'import au terminal bloquerait sur « Reboot, yes? »)", () => {
    assert.doesNotMatch(script, /\/system reboot/);
  });

  it("une valeur piégée ne casse pas la chaîne RouterOS", () => {
    const piege = buildSstpInstallScript({
      connectTo: "1.2.3.4", port: "443", username: 'u"; /system reboot; :put "', password: "p",
      apiPassword: "a", tunnelSubnet: "192.168.200.0/24", callbackUrl: "https://x",
      callbackMode: "https", installToken: "t", identityName: "HS",
    });
    assert.ok(!/user="u"; /.test(piege));
  });
});

describe("méthodes de tunnel", () => {
  it("SSTP passe par le relais comme WireGuard et OpenVPN", () => {
    for (const m of ["vpn", "openvpn", "sstp"]) assert.equal(isTunnelMethod(m), true, m);
    for (const m of ["direct", "", null, undefined]) assert.equal(isTunnelMethod(m), false, String(m));
  });

  it("chaque tunnel a son libellé — plus de « Directe (API) » pour un routeur OpenVPN", () => {
    assert.equal(tunnelLabel("vpn"), "WireGuard");
    assert.equal(tunnelLabel("openvpn"), "OpenVPN");
    assert.equal(tunnelLabel("sstp"), "SSTP");
    assert.equal(tunnelLabel("direct"), "Direct");
  });
});
