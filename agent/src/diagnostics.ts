import type { Transport } from './configurator';

export function connectionMessage(error: unknown, encrypted: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/handshake|alert number 40|no shared cipher/i.test(message)) return 'API-SSL 8729 : négociation TLS impossible. RouterOS peut avoir un service API-SSL sans certificat (mode anonyme incompatible avec ce client). Configurez un certificat valide, ou sélectionnez explicitement l’API locale 8728 sur un réseau de confiance. Aucun basculement non chiffré automatique.';
  if (/certificate|CERT_|self.signed|unable to verify/i.test(message)) return 'Certificat TLS non vérifiable. Fournissez l’autorité CA et utilisez une IP présente dans le certificat. La validation TLS reste active.';
  if (/ECONNRESET|closed by peer|EPIPE/i.test(message)) return `Connexion API ${encrypted ? 'chiffrée ' : ''}fermée par le routeur. Vérifiez IP → Services → api → Available From et le pare-feu : un port ouvert ne garantit pas que votre IP est autorisée. Le compte du portail captif ne donne pas les droits d’administration.`;
  if (/invalid user|password|login failed|authentication failed/i.test(message)) return 'Authentification administrateur refusée. Utilisez le compte RouterOS (ou le mot de passe de l’étiquette usine), pas le compte du portail captif.';
  if (/ECONNREFUSED|ETIMEDOUT|timed out|inaccessible|EHOSTUNREACH|ENETUNREACH/i.test(message)) return 'API RouterOS inaccessible : vérifiez l’adresse, le port et le câble sur un port LAN. Un routeur sans configuration IP nécessite une initialisation locale (par exemple WinBox par MAC). L’agent ne peut pas activer une API inaccessible par cette même API.';
  return message;
}

export async function inspectRouter(transport: Transport) {
  const resource = (await transport.read('/system/resource/print'))[0];
  const board = (await transport.read('/system/routerboard/print'))[0];
  if (!resource || !board) throw new Error('Réponse API incomplète : identité non confirmée.');
  const mode = (await transport.read('/system/device-mode/print'))[0] ?? {};
  return { version: resource.version, model: resource['board-name'] ?? board.model, architecture: resource['architecture-name'], serial: board['serial-number'], deviceMode: mode, message: 'Connexion administrateur confirmée. Diagnostic en lecture seule : aucune configuration ni mise à jour exécutée.' };
}
