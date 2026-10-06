import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionMessage, inspectRouter } from '../src/diagnostics';
import { parseGateways } from '../src/scanner';

test('explique TLS sans proposer de désactiver la validation', () => {
  assert.match(connectionMessage(new Error('SSL sslv3 alert handshake failure'), true), /certificat/);
  assert.match(connectionMessage(new Error('read ECONNRESET'), false), /Available From/);
  assert.match(connectionMessage(new Error('invalid user name or password'), false), /administrateur/);
});
test('diagnostic strictement en lecture seule', async () => {
  const paths: string[] = [];
  const result = await inspectRouter({
    async read(path) { paths.push(path); return path.includes('resource') ? [{version:'7.24.4','board-name':'hAP','architecture-name':'arm'}] : path.includes('routerboard') ? [{'serial-number':'SERIAL'}] : [{mode:'home'}]; },
    async command() { throw Error('Mutation interdite'); }, async begin() { throw Error('Mutation interdite'); },
  });
  assert.equal(result.version, '7.24.4');
  assert.ok(paths.every(p => p.endsWith('/print')));
});
test('passerelles privées indépendantes de la taille du sous-réseau', () => {
  assert.deepEqual(parseGateways('default 10.0.0.1 UGScg en0\ndefault link#20 UCSIg utun1', 'darwin'), ['10.0.0.1']);
  assert.deepEqual(parseGateways('default via 192.168.88.1 dev eth0', 'linux'), ['192.168.88.1']);
});
