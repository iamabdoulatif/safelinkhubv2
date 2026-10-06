import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConfiguration, type Transport, type Progress } from '../src/configurator';

function fixture(options: { confirm?: boolean; changeIdentity?: boolean; reject?: boolean; downloadFails?: boolean } = {}) {
  let now = 0;
  let version = '7.19';
  let mode: Record<string, string> = { mode: 'home', routerboard: 'no', container: 'no' };
  const commands: string[][] = [];
  const events: Progress[] = [];
  let pending: string[] | undefined;
  const transport: Transport = {
    async read(path) {
      if (path === '/system/routerboard/print') return [{ 'serial-number': options.changeIdentity && commands.length ? 'OTHER' : 'SERIAL' }];
      if (path === '/system/resource/print') return [{ version, 'architecture-name': 'arm64' }];
      if (path === '/system/package/update/print') return [{ 'installed-version': version, 'latest-version': '7.20', status: options.downloadFails ? 'ERROR: connection failed' : 'New version is available' }];
      if (path === '/system/device-mode/print') return [mode];
      return [];
    },
    async command(words) { commands.push(words); },
    async begin(words) {
      commands.push(words);
      pending = words;
      return { error: () => options.reject ? new Error('not enough permissions') : undefined, close() {} };
    },
  };
  const sleep = async (ms: number) => {
    now += ms;
    if (!pending || options.confirm === false) return;
    if (pending[0].includes('/install')) version = '7.20';
    else {
      if (pending.includes('=mode=advanced')) mode = { mode: 'advanced', routerboard: 'no' };
      for (const word of pending.slice(1)) {
        const [, key, value] = word.split('=');
        mode[key] = value;
      }
    }
    pending = undefined;
  };
  return { commands, events, transport, now: () => now, sleep };
}

test('upgrade puis commandes distinctes dans l’ordre ; signale routerboard réinitialisé', async () => {
  const f = fixture();
  const result = await runConfiguration(f.transport, e => f.events.push(e), f);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(f.commands.filter(c => c[0].includes('device-mode')), [
    ['/system/device-mode/update', '=routerboard=yes'],
    ['/system/device-mode/update', '=mode=advanced'],
    ['/system/device-mode/update', '=container=yes', '=hotspot=yes', '=scheduler=yes', '=fetch=yes'],
  ]);
  assert.ok(f.commands.findIndex(c => c[0].endsWith('/install')) < f.commands.findIndex(c => c[0].includes('device-mode')));
  assert.equal(f.events.filter(e => e.state === 'waiting-physical').length, 3);
});

test('sans confirmation, ne poursuit pas et ne renvoie pas la commande', async () => {
  const f = fixture({ confirm: false });
  await assert.rejects(runConfiguration(f.transport, () => {}, f), /délai/i);
  assert.equal(f.commands.filter(c => c[0].endsWith('/install')).length, 1);
  assert.equal(f.commands.filter(c => c[0].includes('device-mode')).length, 0);
});

test('refus API explicite : arrêt immédiat', async () => {
  const f = fixture({ reject: true });
  await assert.rejects(runConfiguration(f.transport, () => {}, f), /permissions/);
});

test('ne reprend jamais sur un routeur différent', async () => {
  const f = fixture({ changeIdentity: true });
  await assert.rejects(runConfiguration(f.transport, () => {}, f), /identité/i);
});

test('échec de recherche de mise à jour : aucune installation', async () => {
  const f = fixture({ downloadFails: true });
  await assert.rejects(runConfiguration(f.transport, () => {}, f), /connection failed/);
  assert.equal(f.commands.some(c => c[0].endsWith('/install')), false);
});

test('confirmation physique absente : aucune deuxième commande device-mode', async () => {
  const f = fixture({ confirm: false });
  const original = f.transport.read;
  f.transport.read = async path => path === '/system/resource/print' ? [{ version: '7.20', 'architecture-name': 'arm64' }] : original(path);
  await assert.rejects(runConfiguration(f.transport, () => {}, f), /délai/i);
  assert.equal(f.commands.filter(c => c[0].includes('device-mode')).length, 1);
});

test('aucun downgrade si la version installée est plus récente', async () => {
  const f = fixture();
  const original = f.transport.read;
  f.transport.read = async path => path === '/system/resource/print' ? [{ version: '7.21', 'architecture-name': 'arm64' }] : original(path);
  await assert.rejects(runConfiguration(f.transport, () => {}, f), /downgrade/i);
  assert.equal(f.commands.some(c => c[0].endsWith('/install')), false);
});

test('vérification finale refuse une fonctionnalité manquante', async () => {
  const f = fixture();
  const original = f.transport.read;
  let finalReads = 0;
  f.transport.read = async path => {
    const rows = await original(path);
    if (path === '/system/device-mode/print' && rows[0].container === 'yes' && ++finalReads > 1) return [{ ...rows[0], hotspot: 'no' }];
    return rows;
  };
  await assert.rejects(runConfiguration(f.transport, () => {}, f), /Vérification finale/);
});

test('préparation hors ligne explicite : aucune commande package/update', async () => {
  const f = fixture();
  const result = await runConfiguration(f.transport, () => {}, f, { updateRouterOS: false });
  assert.equal(f.commands.some(c => c[0].includes('/package/update')), false);
  assert.ok(result.warnings.some(w => /différée/i.test(w)));
});
