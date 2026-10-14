import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupApiTls, CA_NAME, serverCertName } from '../src/tls-setup';
import type { Transport } from '../src/configurator';

function fakeRouter(existing: Record<string, string>[] = []) {
  const certs = [...existing];
  const sent: string[][] = [];
  const client = {
    async talk(words: string[]) {
      sent.push(words);
      const arg = (k: string) => words.find(w => w.startsWith(`=${k}=`))?.slice(k.length + 2);
      const query = words.find(w => w.startsWith('?name='))?.slice(6);
      if (words[0] === '/certificate/print') return certs.filter(c => c.name === query);
      if (words[0] === '/certificate/add') certs.push({ '.id': `*${certs.length + 1}`, name: arg('name')!, 'subject-alt-name': arg('subject-alt-name') ?? '' });
      if (words[0] === '/ip/service/print') return [{ '.id': '*S', name: 'api-ssl', port: '8729' }];
      if (words[0] === '/file/print') return [{ '.id': '*F', contents: '-----BEGIN CERTIFICATE-----\nMIIC\n-----END CERTIFICATE-----\n' }];
      return [];
    },
  };
  const transport = { withClient: async (fn: (c: never) => unknown) => fn(client as never) } as unknown as Transport;
  return { transport, sent, certs };
}

test('certificat créé, signé par l’autorité, API-SSL activé, PEM récupéré et fichier supprimé', async () => {
  const r = fakeRouter();
  const out = await setupApiTls(r.transport, '192.168.88.1');
  assert.equal(out.port, 8729);
  assert.match(out.ca, /BEGIN CERTIFICATE/);
  assert.ok(r.sent.some(w => w[0] === '/certificate/add' && w.includes('=subject-alt-name=IP:192.168.88.1') && w.includes('=key-usage=tls-server')));
  assert.ok(r.sent.some(w => w[0] === '/certificate/sign' && w.includes(`=ca=${CA_NAME}`)));
  assert.ok(r.sent.some(w => w[0] === '/ip/service/set' && w.includes(`=certificate=${serverCertName('192.168.88.1')}`) && w.includes('=disabled=no')));
  assert.ok(r.sent.some(w => w[0] === '/file/remove'));
});

test('déjà en place pour cette IP : aucun certificat recréé', async () => {
  const r = fakeRouter([{ '.id': '*1', name: CA_NAME }, { '.id': '*2', name: serverCertName('192.168.88.1'), 'subject-alt-name': 'IP:192.168.88.1' }]);
  const out = await setupApiTls(r.transport, '192.168.88.1');
  assert.equal(out.created, false);
  assert.equal(r.sent.some(w => w[0] === '/certificate/add' || w[0] === '/certificate/sign'), false);
});

test('adresse non IPv4 refusée (le certificat porte une IP)', async () => {
  await assert.rejects(setupApiTls(fakeRouter().transport, 'routeur.local'), /IPv4/);
});
