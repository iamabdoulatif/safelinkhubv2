import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgent } from '../src/server';
import { isLocalAddress, subnetHosts, parseMndp } from '../src/scanner';

test('API locale : token, origine, simulation sans transport ni fuite de secret', async t => {
  let connections = 0;
  const agent = createAgent({ dryRun: true, transport() { connections++; throw new Error('Network forbidden'); } });
  const port = await agent.listen(0, 0);
  t.after(() => { agent.server.closeAllConnections(); agent.server.close(); });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/session`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/agent/routers`)).status, 401);
  const { token } = await (await fetch(`${base}/session`)).json();
  const headers = { 'X-Agent-Token': token, 'Content-Type': 'application/json' };
  const response = await fetch(`${base}/agent/routers/192.168.88.1/configure`, { method: 'POST', headers, body: JSON.stringify({ username: 'admin', password: 'DO-NOT-LEAK', port: 8729, tls: true }) });
  assert.equal(response.status, 202);
  const task = await response.json();
  assert.equal(task.state, 'simulated');
  assert.equal(JSON.stringify(task).includes('DO-NOT-LEAK'), false);
  assert.equal(connections, 0);
  const discovery = await (await fetch(`${base}/agent/routers`, { headers })).json();
  assert.deepEqual(discovery.routers, []);
  const invalid = await fetch(`${base}/agent/routers/8.8.8.8/configure`, { method: 'POST', headers, body: JSON.stringify({ username: 'admin', password: '', port: 8728, tls: false }) });
  assert.equal(invalid.status, 400);
});

test('scan borné au masque réel ; pas de cible publique ou loopback', () => {
  assert.equal(isLocalAddress('127.0.0.1'), false);
  assert.equal(isLocalAddress('8.8.8.8'), false);
  assert.equal(isLocalAddress('192.168.88.1'), true);
  assert.deepEqual(subnetHosts('192.168.88.1', '255.255.255.252'), ['192.168.88.2']);
  assert.deepEqual(subnetHosts('10.1.2.3', '255.0.0.0'), []);
  assert.equal(parseMndp(Buffer.from([0, 0, 0, 0, 0, 8, 255, 255])), undefined);
});
