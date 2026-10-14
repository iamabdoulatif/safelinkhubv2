import { createAgent } from './server';
import { execFile } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import sea from 'node:sea';

// Installé (.dmg / .exe) : exécutable autonome Node (SEA) qui embarque l'interface.
// Le journal va dans le dossier de l'utilisateur et le navigateur s'ouvre seul.
const packaged = sea.isSea();
const logFile = packaged ? join(homedir(), '.safelinkhub-agent', 'agent.log') : resolve('agent/safelinkhub.log');
if (packaged) void mkdir(join(homedir(), '.safelinkhub-agent'), { recursive: true, mode: 0o700 }).catch(() => {});
const agent = createAgent({
  dryRun: process.argv.includes('--dry-run'),
  ...(packaged ? { readAsset: (name: string) => Buffer.from(sea.getAsset(name)) } : {}),
  log(event) {
    void appendFile(logFile, JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 })
      .catch(() => console.error('Journal local indisponible. Le suivi reste accessible dans l’interface.'));
  },
});
void agent.listen().then(port => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`SafeLinkHub Agent${process.argv.includes('--dry-run') ? ' — SIMULATION' : ''} : ${url}`);
  if (packaged) console.log('Gardez cette application ouverte pendant la préparation. Fermez-la pour arrêter l’agent.');
  if ((packaged && !process.argv.includes('--no-open')) || process.argv.includes('--open')) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    execFile(command, args, error => { if (error) console.error(`Ouvrez ${url} dans votre navigateur.`); });
  }
}).catch(error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  if (agent.active) console.error('Suivi interrompu. Une commande déjà envoyée au routeur peut continuer. Vérifiez son état avant de relancer.');
  agent.server.close();
  process.exit(0);
});
