/**
 * Script d'installation du tunnel SSTP, écrit pour RouterOS 6 (et valable en 7).
 *
 * POURQUOI SSTP. C'est le seul tunnel qui voyage sur le port 443, comme le
 * web : il passe là où OpenVPN (TCP 1194) est refusé par le FAI. Constaté
 * sur MALO-HOTSPOT (6.49, 25/09/2026) : 443 ouvert, 1194, 993, 22 et 8443
 * refusés avant même d'atteindre le relais.
 *
 * Mêmes règles que le script OpenVPN (openvpn-install-script.ts) :
 *   1. Commandes à ESPACES, jamais de chemins à slashs (syntaxe RouterOS 7).
 *   2. connect-to en ADRESSE IP. Côté relais, Traefik ne renvoie vers le
 *      serveur SSTP que les connexions TLS SANS SNI — or le client SSTP de
 *      RouterOS 6 n'en envoie jamais (arrivé en 7.15). Avec une IP, même un
 *      RouterOS 7 n'en enverra pas.
 *   3. Aucun paramètre inconnu de la 6.x (la ligne est vérifiée par le test).
 *
 * Pas de redémarrage final, contrairement au script OpenVPN : il n'apporte
 * rien au tunnel, et sur /import au terminal il s'arrête sur « Reboot, yes? ».
 */

import { escapeRosString } from "./openvpn-install-script";

export type SstpScriptOptions = {
  /** IP du relais — jamais un nom (voir point 2). */
  connectTo: string;
  port: string;
  username: string;
  password: string;
  apiPassword: string;
  /** Sous-réseau du tunnel SSTP, autorisé à parler à l'API du routeur. */
  tunnelSubnet: string;
  callbackUrl: string;
  callbackMode: "http" | "https";
  installToken: string;
  identityName: string;
};

export function buildSstpInstallScript(opts: SstpScriptOptions): string {
  return `# SafeLinkHub managed SSTP tunnel - auto-generated, do not edit
# Compatible RouterOS 6 et 7 : commandes separees par des espaces, port 443.
/system identity set name="${escapeRosString(opts.identityName)}"
/interface sstp-client remove [find name=safelinkhub-sstp]
/interface sstp-client add name=safelinkhub-sstp connect-to=${opts.connectTo} port=${opts.port} user="${escapeRosString(opts.username)}" password="${escapeRosString(opts.password)}" profile=default-encryption authentication=mschap2 verify-server-certificate=no add-default-route=no disabled=no

/user remove [find name=safelinkhub-api]
/user group remove [find name=safelinkhub-group]
/user group add name=safelinkhub-group policy=api,read,write,policy,test,sensitive,ssh,ftp
/user add name=safelinkhub-api password="${escapeRosString(opts.apiPassword)}" group=safelinkhub-group

# L'API n'ecoute que le tunnel SSTP et le reseau Docker de MikHmon. RouterOS
# 7.24 renomme « address » en « available-from » : le nouveau mot est isole
# dans un :parse pour ne pas faire echouer l'import sur une version plus ancienne.
:do {:local c [:parse "/ip service set api available-from=${opts.tunnelSubnet},11.11.11.0/28"]; $c} on-error={/ip service set api address=${opts.tunnelSubnet},11.11.11.0/28}
/ip service enable api
:log info "SafeLinkHub SSTP tunnel installed"

# Le temps que le tunnel monte avant de prevenir SafeLinkHub, qui verifie
# aussitot qu'il joint le routeur a travers lui.
:delay 10s
:do {
  /tool fetch url="${opts.callbackUrl}" http-header-field="Authorization: Bearer ${opts.installToken}" mode=${opts.callbackMode} output=none
  :log info "SafeLinkHub notified: SSTP tunnel installed"
} on-error={ :log warning "SafeLinkHub SSTP install notification failed" }
`;
}
