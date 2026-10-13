import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeAdminPassword, passwordProblem } from '../src/password';
import type { Transport } from '../src/configurator';

test('mot de passe Winbox : refuse le faible, accepte le correct', () => {
  assert.match(passwordProblem('court1', 'x', 'admin') ?? '', /10/);
  assert.match(passwordProblem('admin12345', 'x', 'admin') ?? '', /deviner/);
  assert.match(passwordProblem('seulementdeslettres', 'x', 'admin') ?? '', /chiffres/);
  assert.match(passwordProblem('Kora2026Wifi', 'Kora2026Wifi', 'admin') ?? '', /différent/);
  assert.equal(passwordProblem('Kora2026Wifi', 'ancien', 'admin'), null);
});

test('changement appliqué au bon compte puis vérifié par reconnexion', async () => {
  const sent: string[][] = [];
  const transport = { withClient: async fn => fn({ talk: async (w: string[]) => { sent.push(w); return w[0] === '/user/print' ? [{ '.id': '*2' }] : []; } } as never) } as Transport;
  let verifiedWith = '';
  await changeAdminPassword(transport, p => { verifiedWith = p; return { read: async () => [{ name: 'R' }] } as unknown as Transport; }, 'admin', 'Kora2026Wifi');
  assert.deepEqual(sent[1], ['/user/set', '=numbers=*2', '=password=Kora2026Wifi']);
  assert.equal(verifiedWith, 'Kora2026Wifi');
  await assert.rejects(changeAdminPassword(transport, () => ({ read: async () => { throw new Error('auth'); } }) as unknown as Transport, 'admin', 'Kora2026Wifi'), /reconnexion a échoué/);
});
