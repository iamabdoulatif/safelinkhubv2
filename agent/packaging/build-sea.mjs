// Exécutable autonome de l'agent (Node SEA) : un seul binaire qui embarque Node,
// le code de l'agent et son interface. Lancer avec le Node OFFICIEL (nodejs.org,
// ≥ 25.5 pour --build-sea) : celui de Homebrew dépend de bibliothèques Homebrew.
//   node agent/packaging/build-sea.mjs  →  dist-agent/safelinkhub-agent[.exe]
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-agent';
mkdirSync(out, { recursive: true });
const esbuild = join('node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
execFileSync(esbuild, ['agent/src/main.ts', '--bundle', '--platform=node', '--format=cjs', '--target=node22', `--outfile=${out}/agent.cjs`, '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });

const binary = join(out, process.platform === 'win32' ? 'safelinkhub-agent.exe' : 'safelinkhub-agent');
const assets = { 'index.html': 'agent/ui/index.html', 'ui.js': 'agent/ui/ui.js', 'style.css': 'agent/ui/style.css' };
const config = join(out, 'sea-config.json');
// --build-sea (Node ≥ 25.5) produit un binaire qui plante sur macOS Intel :
// on y garde la méthode classique (blob + postject), avec Node 24 LTS.
const legacy = Number(process.versions.node.split('.')[0]) < 25 || process.env.SEA_LEGACY === '1';
if (!legacy) {
  writeFileSync(config, JSON.stringify({ main: `${out}/agent.cjs`, output: binary, disableExperimentalSEAWarning: true, assets }, null, 2));
  execFileSync(process.execPath, ['--build-sea', config], { stdio: 'inherit' });
} else {
  const blob = join(out, 'sea-prep.blob');
  writeFileSync(config, JSON.stringify({ main: `${out}/agent.cjs`, output: blob, disableExperimentalSEAWarning: true, assets }, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });
  copyFileSync(process.execPath, binary);
  if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', binary], { stdio: 'inherit' });
  execFileSync('npx', ['--yes', 'postject@1.0.0-alpha.6', binary, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : [])], { stdio: 'inherit', shell: process.platform === 'win32' });
}
// macOS refuse un binaire dont la signature ne correspond plus : signature ad hoc (gratuite, sans compte Apple).
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', '--force', binary], { stdio: 'inherit' });
console.log(`OK : ${binary}`);
