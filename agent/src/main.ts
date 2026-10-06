import { createAgent } from './server';
import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const agent = createAgent({
  dryRun: process.argv.includes('--dry-run'),
  log(event) {
    void appendFile(resolve('agent/safelinkhub.log'), JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 })
      .catch(() => console.error('Journal local indisponible. Le suivi reste accessible dans l’interface.'));
  },
});
void agent.listen().then(port => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`SafeLinkHub Agent${process.argv.includes('--dry-run') ? ' — SIMULATION' : ''} : ${url}`);
  if (process.argv.includes('--open')) {
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
