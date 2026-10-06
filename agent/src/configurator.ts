export type Row = Record<string, string>;
export interface Pending { error(): Error | undefined; close(): void }
export interface Transport {
  read(path: string): Promise<Row[]>;
  command(words: string[]): Promise<void>;
  begin(words: string[]): Promise<Pending>;
}
export type Progress = {
  state: 'checking' | 'upgrading' | 'waiting-physical' | 'verifying';
  step: number;
  message: string;
  deadline?: number;
};
export const DEVICE_STEPS = [
  { words: ['/system/device-mode/update', '=routerboard=yes'], expected: { routerboard: 'yes' } },
  { words: ['/system/device-mode/update', '=mode=advanced'], expected: { mode: 'advanced' } },
  { words: ['/system/device-mode/update', '=container=yes', '=hotspot=yes', '=scheduler=yes', '=fetch=yes'], expected: { container: 'yes', hotspot: 'yes', scheduler: 'yes', fetch: 'yes' } },
] as const;
export const PLAN = [
  ['/system/package/update/set', '=channel=stable'],
  ['/system/package/update/check-for-updates', '=once='],
  ['/system/package/update/print'],
  ['/system/package/update/install'],
  ...DEVICE_STEPS.map(s => [...s.words]),
  ['/system/device-mode/print'],
];

function versionParts(value: string): number[] {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:\s|$)/.exec(value);
  if (!match) throw new Error(`Version non stable ou non reconnue : ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}
function compareVersions(a: string, b: string) {
  const left = versionParts(a), right = versionParts(b);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}
const enabled = (value: string | undefined) => value === 'yes' || value === 'true';
function matches(row: Row, expected: Record<string, string>) {
  return Object.entries(expected).every(([key, value]) => value === 'yes' ? enabled(row[key]) : row[key] === value);
}

export async function runConfiguration(
  transport: Transport,
  report: (progress: Progress) => void,
  clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)) },
  options: { updateRouterOS?: boolean } = {},
) {
  const readOne = async (path: string) => {
    const row = (await transport.read(path))[0];
    if (!row) throw new Error(`Réponse vide : ${path}`);
    return row;
  };
  report({ state: 'checking', step: -1, message: 'Vérification du routeur et de RouterOS…' });
  const board = await readOne('/system/routerboard/print');
  const serial = board['serial-number'];
  if (!serial) throw new Error('Numéro de série indisponible : impossible de garantir l’identité après redémarrage.');
  const resource = await readOne('/system/resource/print');
  if (versionParts(resource.version)[0] !== 7) throw new Error('Cet agent exige RouterOS 7. La migration depuis RouterOS 6 nécessite une procédure séparée.');
  if (!['arm', 'arm64', 'x86', 'x86_64'].includes(resource['architecture-name'])) throw new Error('Architecture incompatible avec le parcours container.');
  const initialMode = await readOne('/system/device-mode/print');
  if (enabled(initialMode.flagged)) throw new Error('Routeur flagged : audit requis avant le déverrouillage.');

  const assertIdentity = async () => {
    const current = await readOne('/system/routerboard/print');
    if (current['serial-number'] !== serial) throw new IdentityError('Identité du routeur différente : arrêt du suivi.');
  };
  async function waitFor(pending: Pending, path: string, predicate: (row: Row) => boolean, timeout: number) {
    const deadline = clock.now() + timeout;
    try {
      while (clock.now() < deadline) {
        const error = pending.error();
        if (error) throw error;
        await clock.sleep(5000);
        try {
          await assertIdentity();
          const row = await readOne(path);
          if (pending.error()) throw pending.error();
          if (predicate(row)) return;
          if (path === '/system/resource/print') {
            const update = await readOne('/system/package/update/print');
            if (/error|failed|not enough/i.test(update.status ?? '')) throw new UpdateError(update.status);
          }
          if (row.status && /error|failed|not enough/i.test(row.status)) throw new UpdateError(row.status);
        } catch (error) {
          if (error instanceof IdentityError || error instanceof UpdateError || pending.error()) throw error;
          // Le routeur peut être hors ligne durant le redémarrage. Aucune écriture répétée.
        }
      }
      throw new Error('Délai dépassé : changement non confirmé. Aucune étape suivante n’a été exécutée.');
    } finally { pending.close(); }
  }

  // Les versions intermédiaires proposées par MikroTik sont suivies, avec une borne explicite.
  const updateRequested = options.updateRouterOS !== false;
  let updated = !updateRequested;
  if (updateRequested) report({ state: 'upgrading', step: 0, message: 'Recherche de la dernière version stable depuis le routeur…' });
  for (let round = 0; updateRequested && round < 5; round++) {
    await assertIdentity();
    await transport.command(['/system/package/update/set', '=channel=stable']);
    await transport.command(['/system/package/update/check-for-updates', '=once=']);
    let update = await readOne('/system/package/update/print');
    for (let poll = 0; /finding|checking/i.test(update.status ?? '') && poll < 12; poll++) {
      await clock.sleep(5000);
      update = await readOne('/system/package/update/print');
    }
    if (/error|failed/i.test(update.status ?? '')) throw new Error(update.status);
    if (!/New version is available|System is already up to date/i.test(update.status ?? '')) throw new Error(`Recherche de mise à jour non terminée : ${update.status ?? 'statut absent'}`);
    const current = (await readOne('/system/resource/print')).version;
    const latest = update['latest-version'];
    if (!latest) throw new Error('La recherche de mise à jour ne fournit aucune version cible. Vérifiez Internet et DNS sur le routeur.');
    const comparison = compareVersions(latest, current);
    if (comparison < 0) throw new Error('Le canal stable propose une version plus ancienne : downgrade refusé.');
    if (comparison === 0) { updated = true; break; }
    report({ state: 'upgrading', step: 0, message: `Installation RouterOS ${latest} : téléchargement puis redémarrage automatique. Ne coupez pas l’alimentation.`, deadline: clock.now() + 900000 });
    await assertIdentity();
    const pending = await transport.begin(['/system/package/update/install']);
    await waitFor(pending, '/system/resource/print', row => compareVersions(row.version, latest) === 0, 900000);
  }
  if (!updated) throw new Error('Limite de mises à jour intermédiaires atteinte. Relancez après vérification de la version.');

  for (const [index, step] of DEVICE_STEPS.entries()) {
    await assertIdentity();
    const before = await readOne('/system/device-mode/print');
    if (matches(before, step.expected)) {
      report({ state: 'verifying', step: index + 1, message: 'Paramètres déjà actifs : aucune demande physique nécessaire.' });
      continue;
    }
    // Les trois commandes restent séparées, sans ajout de paramètre ni réordonnancement.
    const pending = await transport.begin([...step.words]);
    report({ state: 'waiting-physical', step: index + 1, message: 'Débranchez puis rebranchez l’alimentation du routeur dans les 5 minutes pour confirmer. Vous pouvez aussi utiliser le bouton prévu par la documentation du modèle, sans maintien prolongé ni réinitialisation usine. Reprise automatique après vérification.', deadline: clock.now() + 300000 });
    await waitFor(pending, '/system/device-mode/print', row => matches(row, step.expected), 420000);
    report({ state: 'verifying', step: index + 1, message: 'Modification confirmée sur le routeur.' });
  }
  await assertIdentity();
  report({ state: 'verifying', step: 4, message: 'Vérification finale des fonctionnalités…' });
  const final = await readOne('/system/device-mode/print');
  if (final.mode !== 'advanced' || !matches(final, DEVICE_STEPS[2].expected)) throw new Error('Vérification finale échouée : fonctionnalités attendues absentes.');
  const warnings: string[] = updateRequested ? [] : ['Mise à jour RouterOS différée explicitement : dernière version non vérifiée. Préparation effectuée avec la version installée.'];
  if (!enabled(final.routerboard)) warnings.push('routerboard=yes n’est plus actif après mode=advanced. Ordre demandé respecté ; aucune correction supplémentaire envoyée.');
  return { version: (await readOne('/system/resource/print')).version, deviceMode: final, warnings };
}
class IdentityError extends Error {}
class UpdateError extends Error {}
