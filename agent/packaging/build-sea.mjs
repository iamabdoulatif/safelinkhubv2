// Exécutable autonome de l'agent (Node SEA) : un seul binaire qui embarque Node,
// le code de l'agent et son interface. Lancer avec le Node OFFICIEL (nodejs.org,
// ≥ 25.5 pour --build-sea) : celui de Homebrew dépend de bibliothèques Homebrew.
//   node agent/packaging/build-sea.mjs  →  dist-agent/safelinkhub-agent[.exe]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-agent';
mkdirSync(out, { recursive: true });
const esbuild = join('node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
execFileSync(esbuild, ['agent/src/main.ts', '--bundle', '--platform=node', '--format=cjs', '--target=node22', `--outfile=${out}/agent.cjs`, '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });

const binary = join(out, process.platform === 'win32' ? 'safelinkhub-agent.exe' : 'safelinkhub-agent');
writeFileSync(join(out, 'sea-config.json'), JSON.stringify({
  main: `${out}/agent.cjs`,
  output: binary,
  disableExperimentalSEAWarning: true,
  assets: { 'index.html': 'agent/ui/index.html', 'ui.js': 'agent/ui/ui.js', 'style.css': 'agent/ui/style.css' },
}, null, 2));
execFileSync(process.execPath, ['--build-sea', join(out, 'sea-config.json')], { stdio: 'inherit' });
// macOS refuse un binaire dont la signature ne correspond plus : signature ad hoc (gratuite, sans compte Apple).
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', '--force', binary], { stdio: 'inherit' });
console.log(`OK : ${binary}`);
