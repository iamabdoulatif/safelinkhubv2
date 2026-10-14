// Chiffrement automatique de l'API : sur un MikroTik neuf, API-SSL (8729) n'a
// pas de certificat, donc l'agent se connecte d'abord en 8728 (clair). Par
// cette connexion, il crée une autorité locale + un certificat serveur valable
// pour l'IP du routeur, active API-SSL avec, récupère le certificat PUBLIC de
// l'autorité, puis vérifie une vraie connexion TLS (certificat ET adresse
// validés). Aucune clé privée ne quitte le routeur.
import type { RouterOSClient } from '../../src/lib/mikrotik/client';
import type { Transport } from './configurator';

type Row = Record<string, string>;
export const CA_NAME = 'slh-api-ca';
export const serverCertName = (host: string) => `slh-api-${host.replace(/[^0-9a-zA-Z.-]/g, '_')}`;
const EXPORT_FILE = 'slh-api-ca';

const yes = (v: string | undefined) => v === 'true' || v === 'yes';
const valid = (row: Row | undefined) => !!row && !yes(row.expired) && !yes(row.revoked) && !yes(row.invalid);

async function find(client: RouterOSClient, name: string): Promise<Row | undefined> {
  return (await client.talk(['/certificate/print', `?name=${name}`]))[0];
}

/** Signe un certificat (génération de clé : de quelques secondes à ~1 min sur les petits modèles). */
async function sign(client: RouterOSClient, name: string, ca?: string) {
  await client.talk(['/certificate/sign', `=numbers=${name}`, ...(ca ? [`=ca=${ca}`] : [])], 180000);
}

export async function setupApiTls(transport: Transport, host: string): Promise<{ ca: string; port: number; created: boolean }> {
  if (!transport.withClient) throw new Error('Transport sans session complète.');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new Error('Chiffrement automatique : adresse IPv4 requise.');
  return transport.withClient(async client => {
    let created = false;
    // 1. Autorité locale (réutilisée si déjà posée par l'agent).
    if (!valid(await find(client, CA_NAME))) {
      const old = await find(client, CA_NAME);
      if (old?.['.id']) await client.talk(['/certificate/remove', `=numbers=${old['.id']}`]).catch(() => {});
      await client.talk(['/certificate/add', `=name=${CA_NAME}`, '=common-name=SafeLinkHub API CA', '=key-usage=key-cert-sign,crl-sign', '=days-valid=3650']);
      await sign(client, CA_NAME);
      created = true;
    }
    // 2. Certificat serveur pour CETTE adresse (le client vérifie l'IP).
    const name = serverCertName(host);
    const server = await find(client, name);
    if (!valid(server) || !server?.['subject-alt-name']?.includes(host) || created) {
      // Retirer une autorité emporte les certificats qu'elle a signés : ligne peut-être déjà partie.
      if (server?.['.id']) await client.talk(['/certificate/remove', `=numbers=${server['.id']}`]).catch(() => {});
      await client.talk(['/certificate/add', `=name=${name}`, `=common-name=${host}`, `=subject-alt-name=IP:${host}`, '=key-usage=tls-server', '=days-valid=3650']);
      await sign(client, name, CA_NAME);
      created = true;
    }
    // 3. API-SSL activé avec ce certificat.
    const service = (await client.talk(['/ip/service/print', '?name=api-ssl']))[0];
    if (!service?.['.id']) throw new Error('Service api-ssl introuvable sur ce routeur.');
    await client.talk(['/ip/service/set', `=numbers=${service['.id']}`, `=certificate=${name}`, '=disabled=no']);
    const port = Number(service.port) || 8729;
    // 4. Certificat PUBLIC de l'autorité (PEM), lu puis fichier supprimé.
    await client.talk(['/certificate/export-certificate', `=numbers=${CA_NAME}`, `=file-name=${EXPORT_FILE}`]);
    let pem = '';
    for (let i = 0; i < 10 && !pem.includes('END CERTIFICATE'); i++) {
      const file = (await client.talk(['/file/print', `?name=${EXPORT_FILE}.crt`, '=.proplist=.id,contents']))[0];
      pem = file?.contents ?? '';
      if (!pem.includes('END CERTIFICATE')) await new Promise(r => setTimeout(r, 500));
    }
    const files = await client.talk(['/file/print', `?name=${EXPORT_FILE}.crt`, '=.proplist=.id']).catch(() => [] as Row[]);
    for (const f of files) if (f['.id']) await client.talk(['/file/remove', `=numbers=${f['.id']}`]).catch(() => {});
    if (!pem.includes('BEGIN CERTIFICATE')) throw new Error('Certificat exporté illisible : réessayez, ou collez-le à la main (Files › slh-api-ca.crt).');
    return { ca: pem.trim(), port, created };
  });
}
