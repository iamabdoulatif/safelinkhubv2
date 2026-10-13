import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damagedPortVerdict, diagnoseRouter, portLabel, uptimeSeconds } from '../src/health';
import type { Transport } from '../src/configurator';

test('uptime RouterOS en secondes', () => {
  assert.equal(uptimeSeconds('1w2d3h4m5s'), 604800 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5);
});
test('port nommé par son nom ET son nom d’usine', () => {
  assert.equal(portLabel({ name: 'E1-WAN-FAI', 'default-name': 'ether1' }), 'E1-WAN-FAI (ether1)');
  assert.equal(portLabel({ name: 'ether2', 'default-name': 'ether2' }), 'ether2');
});
test('port abîmé : erreurs physiques ou coupures répétées, pas quelques erreurs isolées', () => {
  assert.equal(damagedPortVerdict({ 'rx-fcs-error': '3', 'rx-packet': '100000' }, 0, 86400), null);
  assert.match(damagedPortVerdict({ 'rx-fcs-error': '900', 'rx-packet': '100000' }, 0, 86400) ?? '', /erreurs physiques/);
  assert.match(damagedPortVerdict({ 'rx-packet': '100000' }, 60, 86400) ?? '', /coupures/);
});

test('diagnostic : détecte les pannes demandées sans rien écrire', async () => {
  const writes: string[] = [];
  const data: Record<string, Record<string, string>[]> = {
    '/system/routerboard/print': [{ model: 'L41G-2axD', 'board-name': 'hAP ax lite', 'serial-number': 'HEA08XGWQCQ', 'current-firmware': '7.24.5' }],
    '/system/resource/print': [{ 'board-name': 'hAP ax lite', version: '7.24.5', 'architecture-name': 'arm', uptime: '2d' }],
    '/interface/ethernet/print': [
      { '.id': '*1', name: 'ether1', 'default-name': 'ether1', 'orig-mac-address': '48:A9:8A:95:86:AC', running: 'false', 'rx-packet': '10', 'rx-fcs-error': '0' },
      { '.id': '*2', name: 'ether3', 'default-name': 'ether3', running: 'false', 'rx-packet': '50000', 'rx-fcs-error': '800' },
    ],
    '/interface/print': [{ name: 'ether1', 'link-downs': '0' }, { name: 'ether3', 'link-downs': '0' }],
    '/system/clock/print': [{ date: '2024-01-01', time: '00:00:10' }],
    '/system/ntp/client/print': [{ enabled: 'false' }],
    '/interface/wifi/print': [{ '.id': '*5', name: 'wifi1', disabled: 'false', 'configuration.ssid': 'YAHYA', 'configuration.hide-ssid': 'yes' }],
    '/ip/dhcp-server/print': [{ '.id': '*7', name: 'dhcp1', disabled: 'true' }],
    '/ip/dns/print': [{ 'allow-remote-requests': 'false' }],
    '/container/print': [{ '.id': '*9', name: 'mikhmon-sf-v1', 'root-dir': 'flash/mikhmon-app' }],
    '/system/script/print': [{ '.id': '*a', comment: '1' }],
  };
  const client = {
    async talk(words: string[]) {
      const path = words[0];
      if (/\/(add|set|remove|enable|disable|start|stop|run)$/.test(path)) {
        writes.push(path);
        return [];
      }
      return data[path] ?? [];
    },
  };
  const transport = {
    async read() { return []; }, async command() { throw Error('interdit'); }, async begin() { throw Error('interdit'); },
    withClient: <T>(fn: (c: never) => Promise<T>) => fn(client as never),
  } as unknown as Transport;
  const report = await diagnoseRouter(transport);
  assert.equal(report.identity.serial, 'HEA08XGWQCQ');
  assert.equal(report.identity.mac, '48:A9:8A:95:86:AC');
  const ids = report.checks.map(c => c.id);
  for (const id of ['clock', 'wifi-hidden', 'dhcp-disabled', 'dns-remote', 'ports-damaged', 'mikhmon-session-lost']) assert.ok(ids.includes(id), `${id} manquant`);
  assert.match(report.checks.find(c => c.id === 'ports-damaged')!.detail, /ether3/);
  // Seules écritures tolérées : le script temporaire de lecture de MikHmon.
  assert.ok(writes.every(w => w.startsWith('/system/script/')), `écritures inattendues : ${writes.join(', ')}`);
});
