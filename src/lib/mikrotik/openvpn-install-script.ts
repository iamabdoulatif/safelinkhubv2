/**
 * Script d'installation du tunnel OpenVPN, écrit POUR ROUTEROS 6 (6.0 → 6.49.x).
 *
 * POURQUOI RouterOS 6 ET PAS 7. OpenVPN est le chemin des cartes MIPS restées
 * en 6.x : WireGuard n'existe pas avant RouterOS 7, et les 39 routeurs du parc
 * qui savent le faire l'utilisent déjà. Ce script n'a donc qu'une cible, et
 * trois contraintes de la 6.x qu'il faut respecter à la lettre :
 *
 *   1. PAS DE CHEMINS À SLASHS. `/interface/ovpn-client/remove` est une
 *      écriture RouterOS 7. La 6.x veut des espaces et répond sinon
 *      « expected command name » en s'arrêtant à cette ligne — l'import
 *      abandonne, et le routeur reste sans tunnel.
 *   2. TCP UNIQUEMENT. Le client OVPN de RouterOS 6 ne sait pas faire d'UDP ;
 *      c'est RouterOS 7 qui l'a apporté. Le serveur du relais écoute donc en
 *      TCP sur 1194.
 *   3. CBC UNIQUEMENT. Pas d'AEAD avant RouterOS 7 : `aes256-gcm` n'existe pas
 *      en 6.x, et son `aes256` désigne l'AES-256-CBC. Le serveur annonce
 *      AES-256-CBC en plus de GCM pour que la négociation aboutisse.
 *
 * Ces trois points se tiennent : changer l'un sans les deux autres donne un
 * script qui s'importe puis ne se connecte jamais, ce qui est plus long à
 * diagnostiquer qu'une erreur franche à l'import.
 */

/** Échappe une valeur destinée à une chaîne entre guillemets de RouterOS. */
export function escapeRosString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type OpenvpnScriptOptions = {
  connectTo: string;
  port: string;
  username: string;
  password: string;
  apiPassword: string;
  callbackUrl: string;
  callbackMode: "http" | "https";
  installToken: string;
  identityName: string;
};

export function buildOpenvpnInstallScript(opts: OpenvpnScriptOptions): string {
  return `# SafeLinkHub managed OpenVPN tunnel - auto-generated, do not edit
# Compatible RouterOS 6.0 - 6.49.x : commandes separees par des espaces,
# transport TCP, chiffrement CBC. Ne pas introduire de syntaxe RouterOS 7.
/system identity set name="${escapeRosString(opts.identityName)}"
/interface ovpn-client remove [find name=safelinkhub-ovpn]
/interface ovpn-client add name=safelinkhub-ovpn connect-to=${opts.connectTo} port=${opts.port} protocol=tcp cipher=aes256 auth=sha1 user="${opts.username}" password="${opts.password}" mode=ip add-default-route=no disabled=no

/user remove [find name=safelinkhub-api]
/user group remove [find name=safelinkhub-group]
/user group add name=safelinkhub-group policy=api,read,write,policy,test,sensitive,ssh,ftp
/user add name=safelinkhub-api password="${opts.apiPassword}" group=safelinkhub-group


# Scoped to the tunnel subnet plus the Docker subnet — MikHmon runs inside
# the container at 11.11.11.11 and connects to the router's own API at the
# DOCKER-SAFELINKHUB bridge gateway (11.11.11.1) to manage hotspot users/vouchers.
# Restricting to the tunnel subnet alone silently rejects that connection
# and MikHmon's session settings show "MikroTik Not Connected" even with
# correct IP/credentials — see provisionHotspotStack's matching allowlist.
/ip service set api address=10.67.0.0/24,11.11.11.0/28
/ip service enable api
:log info "SafeLinkHub OpenVPN tunnel installed successfully"

:delay 5s
:do {
  /tool fetch url="${opts.callbackUrl}" http-header-field="Authorization: Bearer ${opts.installToken}" mode=${opts.callbackMode} output=none
  :log info "SafeLinkHub server notified that OpenVPN tunnel installation completed"
} on-error={ :log warning "SafeLinkHub server install completion notification failed" }

:log info "SafeLinkHub rebooting router to finalize installation"
:delay 3s
/system reboot
`;
}
