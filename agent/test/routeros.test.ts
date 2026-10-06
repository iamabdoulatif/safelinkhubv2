import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { routerTransport } from '../src/routeros';

function sentence(words: string[]) {
  return Buffer.concat([...words.map(word => { const data = Buffer.from(word); return Buffer.concat([Buffer.from([data.length]), data]); }), Buffer.from([0])]);
}
test('transport TCP : lecture et refus API propagé pendant une commande longue', async t => {
  const server = createServer(socket => {
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const words: string[] = [];
        let offset = 0, complete = false;
        while (offset < buffer.length) {
          const length = buffer[offset++];
          if (!length) { complete = true; break; }
          if (offset + length > buffer.length) break;
          words.push(buffer.subarray(offset, offset + length).toString()); offset += length;
        }
        if (!complete) return;
        buffer = buffer.subarray(offset);
        if (words[0] === '/login') socket.write(sentence(['!done']));
        else if (words[0] === '/system/resource/print') socket.write(Buffer.concat([sentence(['!re', '=version=7.20']), sentence(['!done'])]));
        else socket.write(Buffer.concat([sentence(['!trap', '=message=not enough permissions']), sentence(['!done'])]));
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const transport = routerTransport({ host: '127.0.0.1', port: address.port, username: 'admin', password: 'test', tls: false });
  assert.equal((await transport.read('/system/resource/print'))[0].version, '7.20');
  const pending = await transport.begin(['/system/device-mode/update', '=routerboard=yes']);
  try {
    for (let i = 0; i < 100 && !pending.error(); i++) await setTimeout(10);
    assert.match(pending.error()?.message ?? '', /not enough permissions/);
  } finally { pending.close(); }
});
