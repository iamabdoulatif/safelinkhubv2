// DIAGNOSTIC ET DÉPANNAGE d'un MikroTik depuis l'agent local.
//
// Identifie l'appareil (modèle, n° de série, adresse MAC, versions), détecte
// les pannes courantes et répare celles qui peuvent l'être sans risque :
//   • tickets MikHmon qui n'expirent pas (horloge non synchronisée, dates au
//     format ISO de RouterOS 7.24, balayage d'expiration cassé) ;
//   • Wi-Fi invisible (radio désactivée, SSID masqué, 5 GHz coincée en DFS,
//     paquet Wi-Fi absent) ;
//   • configuration supprimée qui empêche le routeur de fonctionner (NAT,
//     DNS, DHCP, client DHCP du WAN, serveur hotspot) ;
//   • ports Ethernet abîmés (erreurs physiques, liaison instable, mauvaise
//     négociation) — signalés par leur NOM ;
//   • session MikHmon effacée par un utilisateur de MikHmon — restaurée.
//
// La partie générique (CPU, mémoire, NAT, route, Wi-Fi, conteneur, firmware…)
// vient de l'audit du SaaS (src/lib/mikrotik/router-audit.ts) : un seul moteur,
// les mêmes règles que dans l'admin SafeLinkHub.
//
// LECTURE SEULE pour le diagnostic. Chaque réparation est une action séparée,
// explicite, déclenchée par l'utilisateur ; ce qui demande un geste sur site
// (câble, port, téléchargement d'un paquet) est seulement signalé.

import { randomBytes } from 'node:crypto';
import type { RouterOSClient } from '../../src/lib/mikrotik/client';
import { auditRouter, type AuditFinding } from '../../src/lib/mikrotik/router-audit';
import { rewriteIsoExpiryComments, repairExpirySweeps } from '../../src/lib/mikrotik/router-audit-fixes';
import { inspectProfileOnLogin } from '../../src/lib/mikrotik/expiry-sweep-script';
import { countUnreadableSales, ensureOwnerSweep, OWNER_SWEEP_NAME, overwritesSaleOwner, rewriteIsoSalesRecords } from '../../src/lib/mikrotik/mikhmon-sales';
import { fixWifiDfs, optimizeWifiThroughput, readWifiState } from '../../src/lib/mikrotik/wifi-compat';
import { buildMikhmonResyncRos, mikhmonLegacyDecrypt } from '../../src/lib/mikrotik/mikhmon-session';
import { optimizeRouterThroughput, runRouterSpeedTest } from '../../src/lib/mikrotik/router-throughput';
import { migrateMikhmonToFlash } from '../../src/lib/mikrotik/mikhmon-flash';
import { ensureApiReachableFromContainer } from '../../src/lib/mikrotik/api-service-access';
import type { Transport } from './configurator';

type Row = Record<string, string>;
export type Severity = 'error' | 'warn' | 'info' | 'ok';
export type FixId =
  | 'ntp' | 'ticket-expiry' | 'expiry-sweep' | 'mikhmon-sales'
  | 'wifi-enable' | 'wifi-unhide' | 'wifi-dfs'
  | 'nat' | 'dns-remote' | 'dhcp-enable' | 'hotspot-enable' | 'wan-dhcp'
  | 'mikhmon-start' | 'mikhmon-session'
  // Maintenance (menu « Maintenance » du SaaS), lancée à la demande :
  | 'wifi-optimize' | 'throughput-optimize' | 'speed-test' | 'mikhmon-credentials' | 'mikhmon-reinstall';
export type Check = { id: string; area: string; severity: Severity; title: string; detail: string; fix?: FixId };
export type Identity = {
  model: string; boardName: string; serial: string; mac: string;
  version: string; firmware: string; architecture: string; uptime: string;
};
export type HealthReport = { identity: Identity; score: number; checks: Check[] };

const AGENT_COMMENT = 'safelinkhub-agent';
const MIKHMON_API_USER = 'mikhmon-api';
const num = (v: string | undefined) => Number(v ?? 0) || 0;
const yes = (v: string | undefined) => v === 'true' || v === 'yes';

/** Libellés lisibles d'un port : « E1-WAN-FAI (ether1) ». */
export function portLabel(row: Row): string {
  const name = row.name ?? '?';
  const def = row['default-name'];
  return def && def !== name ? `${name} (${def})` : name;
}

/**
 * Un port est suspect s'il accumule des erreurs PHYSIQUES (FCS, alignement,
 * fragments, jabber, collisions tardives) ou si sa liaison tombe sans cesse.
 * Seuils volontairement prudents : quelques erreurs isolées ne prouvent rien.
 */
export function damagedPortVerdict(eth: Row, linkDowns: number, uptimeSeconds: number): string | null {
  const rxErrors = ['rx-fcs-error', 'rx-align-error', 'rx-fragment', 'rx-jabber'].reduce((s, k) => s + num(eth[k]), 0);
  const txErrors = ['tx-late-collision', 'tx-excessive-collision', 'tx-fcs-error'].reduce((s, k) => s + num(eth[k]), 0);
  const packets = num(eth['rx-packet']) + num(eth['tx-packet']);
  const errors = rxErrors + txErrors;
  const reasons: string[] = [];
  if (errors >= 50 && errors / Math.max(1, packets) >= 0.001) {
    reasons.push(`${errors} erreurs physiques (${rxErrors} en réception, ${txErrors} en émission)`);
  }
  const days = Math.max(1, uptimeSeconds / 86400);
  if (linkDowns >= 20 && linkDowns / days >= 10) reasons.push(`${linkDowns} coupures de liaison`);
  return reasons.length ? reasons.join(', ') : null;
}

/** « 3d4h5m6s » / « 1w2d » → secondes. */
export function uptimeSeconds(uptime: string | undefined): number {
  const units: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  for (const [, value, unit] of (uptime ?? '').matchAll(/(\d+)([wdhms])/g)) total += Number(value) * units[unit];
  return total;
}

/** Le WAN : interface du client DHCP, sinon le port d'usine ether1 (le nom
 * peut avoir été changé — on se fie au default-name, jamais au nom). */
async function findWan(client: RouterOSClient): Promise<string | null> {
  const dhcp = await client.talk(['/ip/dhcp-client/print']).catch(() => [] as Row[]);
  if (dhcp[0]?.interface) return dhcp[0].interface;
  const eth = await client.talk(['/interface/ethernet/print']).catch(() => [] as Row[]);
  return eth.find(e => e['default-name'] === 'ether1')?.name ?? null;
}

/** Exécute un script RouterOS qui écrit son résultat dans son propre
 * commentaire (l'API ne lit ni les fichiers d'un conteneur ni les variables
 * globales de façon fiable), puis le supprime. */
async function runScriptForResult(client: RouterOSClient, source: string, timeoutMs = 60000): Promise<string> {
  const name = `slh-agent-${randomBytes(4).toString('hex')}`;
  await client.talk(['/system/script/add', `=name=${name}`, `=source=${source}\n/system/script/set [find name="${name}"] comment=$slhOut;`]);
  try {
    await client.talk(['/system/script/run', `=number=${name}`], timeoutMs);
    const row = (await client.talk(['/system/script/print', `?name=${name}`]))[0];
    return row?.comment ?? '';
  } finally {
    const rows = await client.talk(['/system/script/print', `?name=${name}`]).catch(() => [] as Row[]);
    for (const r of rows) if (r['.id']) await client.talk(['/system/script/remove', `=numbers=${r['.id']}`]).catch(() => {});
  }
}

/** Nombre d'entrées `$data[...]` du config.php de MikHmon : 1 = seul le compte
 * d'ouverture reste, la session a été effacée ; ≥ 2 = session présente. */
const MIKHMON_PROBE = [
  ':local slhOut "absent";',
  ':local c [/container find where name~"mikhmon" or root-dir~"mikhmon"];',
  ':if ([:len $c] > 0) do={',
  '  :local rd [/container get [:pick $c 0] root-dir];',
  '  :if ([:pick $rd 0 1] = "/") do={ :set rd [:pick $rd 1 [:len $rd]] };',
  '  :local t ""; :do { :set t [/file get ($rd . "/src/src/include/config.php") contents] } on-error={};',
  '  :local n 0; :local i [:find $t "\\$data[" -1];',
  '  :while ([:typeof $i] = "num") do={ :set n ($n + 1); :set i [:find $t "\\$data[" $i] };',
  '  :set slhOut [:tostr $n];',
  '};',
].join('\n');

/** Identifiants d'ouverture de MikHmon, lus dans son config.php (laksa19 :
 * plusieurs emplacements possibles selon l'image). Sortie « user|mot-chiffré ». */
const MIKHMON_LOGIN_PROBE = [
  ':local slhOut "absent";',
  ':local c [/container find where name~"mikhmon" or root-dir~"mikhmon"];',
  ':if ([:len $c] > 0) do={',
  '  :set slhOut "illisible";',
  '  :local rd [/container get [:pick $c 0] root-dir];',
  '  :if ([:pick $rd 0 1] = "/") do={ :set rd [:pick $rd 1 [:len $rd]] };',
  '  :foreach f in={"/src/src/include/config.php";"/var/www/html/include/config.php";"/app/include/config.php";"/include/config.php"} do={',
  '    :local t ""; :do { :set t [/file get ($rd . $f) contents] } on-error={};',
  '    :local u [:find $t "mikhmon<|<"]; :local p [:find $t "mikhmon>|>"];',
  '    :if (([:typeof $u] = "num") and ([:typeof $p] = "num")) do={',
  '      :set slhOut ([:pick $t ($u + 10) [:find $t "\'" ($u + 10)]] . "|" . [:pick $t ($p + 10) [:find $t "\'" ($p + 10)]]);',
  '    };',
  '  };',
  '};',
].join('\n');

async function readIdentity(client: RouterOSClient): Promise<Identity> {
  const rb = (await client.talk(['/system/routerboard/print']).catch(() => [] as Row[]))[0] ?? {};
  const res = (await client.talk(['/system/resource/print']).catch(() => [] as Row[]))[0] ?? {};
  const eth = await client.talk(['/interface/ethernet/print']).catch(() => [] as Row[]);
  const first = eth.find(e => e['default-name'] === 'ether1') ?? eth[0];
  return {
    model: rb.model ?? res['board-name'] ?? 'Inconnu',
    boardName: res['board-name'] ?? rb['board-name'] ?? 'Inconnu',
    serial: rb['serial-number'] ?? 'Indisponible',
    mac: first?.['orig-mac-address'] || first?.['mac-address'] || 'Indisponible',
    version: res.version ?? '?',
    firmware: rb['current-firmware'] ?? '?',
    architecture: res['architecture-name'] ?? '?',
    uptime: res.uptime ?? '?',
  };
}

/** Correspondance constat de l'audit SaaS → réparation de l'agent. */
const AUDIT_FIX: Record<string, FixId> = {
  'ticket-expiry-format': 'ticket-expiry',
  'expiry-sweep': 'expiry-sweep',
  'wifi-dfs': 'wifi-dfs',
  'no-nat': 'nat',
  'mikhmon-stopped': 'mikhmon-start',
};

export async function diagnoseRouter(transport: Transport): Promise<HealthReport> {
  if (!transport.withClient) throw new Error('Transport sans session complète.');
  return transport.withClient(async client => {
    const identity = await readIdentity(client);
    const checks: Check[] = [];
    const add = (c: Check) => checks.push(c);

    // ── Audit générique du SaaS ────────────────────────────────────────────
    const audit = await auditRouter(client, { mikhmonConfigured: true }).catch(() => null);
    for (const f of audit?.findings ?? []) {
      // La session MikHmon est vérifiée ici sur le fichier lui-même.
      if (f.id === 'mikhmon-session') continue;
      const fix = f.severity === 'ok' || f.severity === 'info' ? undefined : AUDIT_FIX[f.id];
      add({ id: f.id, area: f.area, severity: f.severity as Severity, title: f.title, detail: f.detail, ...(fix ? { fix } : {}) });
    }

    // ── Horloge : sans heure juste, les tickets n'expirent pas à l'heure ───
    const clock = (await client.talk(['/system/clock/print']).catch(() => [] as Row[]))[0] ?? {};
    const ntp = (await client.talk(['/system/ntp/client/print']).catch(() => [] as Row[]))[0] ?? {};
    const year = Number(/^(\d{4})/.exec(clock.date ?? '')?.[1] ?? /\/(\d{4})$/.exec(clock.date ?? '')?.[1] ?? 0);
    if (year && year < 2025) {
      add({ id: 'clock', area: 'Tickets', severity: 'error', title: 'Horloge du routeur fausse', detail: `Le routeur se croit le ${clock.date}. Les tickets MikHmon calculent leur expiration sur cette horloge : ils n'expirent pas (ou expirent n'importe quand).`, fix: 'ntp' });
    } else if (!yes(ntp.enabled) || (ntp.status && !/synchronized/i.test(ntp.status))) {
      add({ id: 'ntp', area: 'Tickets', severity: 'warn', title: 'Horloge non synchronisée (NTP)', detail: `Client NTP ${yes(ntp.enabled) ? `actif mais « ${ntp.status ?? 'non synchronisé'} »` : 'désactivé'}. Après une coupure de courant, l'heure dérive et les tickets n'expirent plus à l'heure.`, fix: 'ntp' });
    } else {
      add({ id: 'ntp', area: 'Tickets', severity: 'ok', title: 'Horloge synchronisée', detail: `NTP synchronisé (${ntp['synced-server'] ?? 'serveur'}), ${clock.date} ${clock.time}.` });
    }

    // ── MikHmon (laksa19 d'origine ou mikhmon-sf-v1) : profils et ventes ────
    // Les scripts sont sur le ROUTEUR, pas dans le conteneur : même correctif
    // quelle que soit l'image MikHmon installée.
    const profiles = await client.talk(['/ip/hotspot/user/profile/print', '=.proplist=.id,name,on-login']).catch(() => [] as Row[]);
    const staleProfiles = inspectProfileOnLogin(profiles as Row[]).stale;
    if (staleProfiles.length) {
      add({ id: 'onlogin-iso', area: 'Tickets', severity: 'error', title: 'Profils MikHmon incompatibles avec RouterOS 7.10+', detail: `${staleProfiles.length} profil(s) (${staleProfiles.slice(0, 5).map(p => p.name).join(', ')}) enregistrent les dates au format ISO : les tickets n'expirent pas et les ventes n'apparaissent pas dans les rapports. Réparation : conversion des dates ajoutée au script de connexion du profil.`, fix: 'expiry-sweep' });
    }
    const sales = await countUnreadableSales(client).catch(() => null);
    if (sales?.found) {
      add({ id: 'mikhmon-sales', area: 'Revenus', severity: 'error', title: 'Ventes absentes des rapports MikHmon', detail: `${sales.found} vente(s) sur ${sales.total} enregistrée(s) au format ISO : invisibles dans les revenus du jour, du mois et les rapports. Réparation : remise au format MikHmon (aucune vente supprimée).`, fix: 'mikhmon-sales' });
    } else if (sales) {
      add({ id: 'mikhmon-sales', area: 'Revenus', severity: 'ok', title: 'Ventes lisibles par les rapports', detail: `${sales.total} vente(s) MikHmon au bon format.` });
    }
    if (sales?.total && overwritesSaleOwner(identity.version)) {
      const sweep = await client.talk(['/system/scheduler/print', `?name=${OWNER_SWEEP_NAME}`]).catch(() => [] as Row[]);
      if (!sweep.length) add({ id: 'mikhmon-owner-sweep', area: 'Revenus', severity: 'warn', title: 'Revenus mensuels : correction automatique absente', detail: `RouterOS ${identity.version} enregistre chaque nouvelle vente avec owner=*sys : les revenus mensuels de MikHmon restent à 0. Réparation : tâche planifiée « ${OWNER_SWEEP_NAME} » (toutes les 2 min).`, fix: 'mikhmon-sales' });
    }

    // ── Wi-Fi invisible ─────────────────────────────────────────────────────
    const wifi = await readWifiState(client).catch(() => null);
    const packages = await client.talk(['/system/package/print']).catch(() => [] as Row[]);
    const hasWifiPackage = packages.some(p => /^(wifi-qcom|wifi-qcom-ac|wireless|wifiwave2)$/.test(p.name ?? '') && !yes(p.disabled));
    // Modèles équipés d'une radio (hAP, cAP, wAP, Audience, Chateau, SXT, LHG…).
    const boardHasRadio = /\b(hap|cap|wap|ax|ac|wifi|wireless|audience|chateau|sxt|lhg|2hnd|2nd)\b/i.test(`${identity.model} ${identity.boardName}`);
    if (wifi && wifi.radios.length === 0 && boardHasRadio && !hasWifiPackage) {
      add({ id: 'wifi-package', area: 'WiFi', severity: 'error', title: 'Paquet Wi-Fi absent', detail: `Le ${identity.boardName} a une radio mais aucun paquet Wi-Fi (wifi-qcom / wireless) n'est installé : aucun réseau ne peut être diffusé. Installez le paquet correspondant à RouterOS ${identity.version} (System → Packages), puis redémarrez.` });
    }
    if (wifi && wifi.radios.length > 0) {
      const off = wifi.radios.filter(r => r.disabled).map(r => r.name);
      if (off.length && off.length < wifi.radios.length) {
        add({ id: 'wifi-some-off', area: 'WiFi', severity: 'warn', title: 'Radio Wi-Fi désactivée', detail: `${off.join(', ')} ne diffuse pas.`, fix: 'wifi-enable' });
      } else if (off.length) {
        const existing = checks.find(c => c.id === 'wifi-off');
        if (existing) existing.fix = 'wifi-enable';
        else add({ id: 'wifi-off', area: 'WiFi', severity: 'error', title: 'Wi-Fi entièrement désactivé', detail: 'Aucune radio ne diffuse.', fix: 'wifi-enable' });
      }
      const rows = wifi.api === 'wifi'
        ? await client.talk(['/interface/wifi/print', '=detail=']).catch(() => [] as Row[])
        : await client.talk(['/interface/wireless/print']).catch(() => [] as Row[]);
      const hidden = rows.filter(r => yes(r['configuration.hide-ssid'] ?? r['hide-ssid'])).map(r => r.name);
      if (hidden.length) add({ id: 'wifi-hidden', area: 'WiFi', severity: 'warn', title: 'Nom du Wi-Fi masqué', detail: `${hidden.join(', ')} diffuse(nt) un SSID caché : les téléphones ne voient pas le réseau.`, fix: 'wifi-unhide' });
      const noSsid = wifi.radios.filter(r => !r.disabled && !(r.ssid ?? '').trim()).map(r => r.name);
      if (noSsid.length) add({ id: 'wifi-no-ssid', area: 'WiFi', severity: 'error', title: 'Wi-Fi sans nom (SSID)', detail: `${noSsid.join(', ')} n'a pas de nom de réseau : renseignez un SSID (WiFi → Configuration).` });
    }

    // ── Configuration supprimée ─────────────────────────────────────────────
    const hasRoute = (await client.talk(['/ip/route/print', '?dst-address=0.0.0.0/0', '?active=true']).catch(() => [] as Row[])).length > 0;
    const dhcpClients = await client.talk(['/ip/dhcp-client/print']).catch(() => [] as Row[]);
    if (!hasRoute && dhcpClients.length === 0) {
      add({ id: 'no-wan-client', area: 'Réseau', severity: 'error', title: 'Accès Internet (WAN) supprimé', detail: "Ni route par défaut ni client DHCP sur le WAN : le routeur n'obtient plus d'adresse de la box. Correctif : recréer le client DHCP sur le port WAN (ether1).", fix: 'wan-dhcp' });
    }
    const dns = (await client.talk(['/ip/dns/print']).catch(() => [] as Row[]))[0] ?? {};
    const dhcpServers = await client.talk(['/ip/dhcp-server/print']).catch(() => [] as Row[]);
    if (dhcpServers.length === 0) {
      add({ id: 'no-dhcp-server', area: 'Réseau', severity: 'error', title: 'Serveur DHCP supprimé', detail: "Aucun serveur DHCP : les téléphones n'obtiennent pas d'adresse et ne peuvent pas se connecter. À recréer (IP → DHCP Server → DHCP Setup) sur le pont du Wi-Fi." });
    } else if (dhcpServers.every(s => yes(s.disabled))) {
      add({ id: 'dhcp-disabled', area: 'Réseau', severity: 'error', title: 'Serveur DHCP désactivé', detail: "Les clients n'obtiennent pas d'adresse.", fix: 'dhcp-enable' });
    }
    if (!yes(dns['allow-remote-requests'])) {
      add({ id: 'dns-remote', area: 'Réseau', severity: 'warn', title: 'DNS du routeur fermé aux clients', detail: "Le DHCP annonce le routeur comme DNS, mais il refuse les requêtes : les sites ne s'ouvrent pas et le portail captif peut ne pas apparaître.", fix: 'dns-remote' });
    }
    const hsProfiles = await client.talk(['/ip/hotspot/profile/print']).catch(() => [] as Row[]);
    const hsServers = await client.talk(['/ip/hotspot/print']).catch(() => [] as Row[]);
    if (hsProfiles.some(p => p.name && p.name !== 'default') && hsServers.length === 0) {
      add({ id: 'no-hotspot', area: 'Portail', severity: 'error', title: 'Serveur hotspot supprimé', detail: "Le profil du portail existe mais plus aucun serveur hotspot : les clients ne voient plus la page de connexion. À recréer (IP → Hotspot → Hotspot Setup) sur le pont du Wi-Fi." });
    } else if (hsServers.length && hsServers.every(s => yes(s.disabled))) {
      add({ id: 'hotspot-disabled', area: 'Portail', severity: 'error', title: 'Serveur hotspot désactivé', detail: "Le portail captif n'apparaît plus.", fix: 'hotspot-enable' });
    }

    // ── Ports abîmés ────────────────────────────────────────────────────────
    const eth = await client.talk(['/interface/ethernet/print', '=stats=']).catch(() => [] as Row[]);
    const ifaces = await client.talk(['/interface/print']).catch(() => [] as Row[]);
    const up = uptimeSeconds(identity.uptime);
    const damaged: string[] = [];
    for (const e of eth) {
      const iface = ifaces.find(i => i.name === e.name);
      const verdict = damagedPortVerdict(e, num(iface?.['link-downs']), up);
      if (verdict) damaged.push(`${portLabel(e)} : ${verdict}`);
      if (yes(e.running)) {
        const mon = (await client.talk(['/interface/ethernet/monitor', `=numbers=${e.name}`, '=once=']).catch(() => [] as Row[]))[0];
        if (mon && mon['full-duplex'] === 'false') damaged.push(`${portLabel(e)} : liaison en half-duplex (${mon.rate ?? '?'}) — câble ou connecteur défectueux`);
        else if (mon && /^10M/i.test(mon.rate ?? '')) damaged.push(`${portLabel(e)} : liaison à 10 Mbit/s — paire de fils coupée ou port fatigué`);
      }
    }
    if (damaged.length) add({ id: 'ports-damaged', area: 'Ports', severity: 'error', title: 'Port(s) probablement abîmé(s)', detail: `${damaged.join(' ; ')}. Changez le câble ; si le défaut persiste sur ce port, utilisez-en un autre.` });
    else if (eth.length) add({ id: 'ports-ok', area: 'Ports', severity: 'ok', title: 'Ports Ethernet sains', detail: `Aucune erreur physique ni coupure anormale sur ${eth.map(portLabel).join(', ')}.` });

    // ── Session MikHmon ─────────────────────────────────────────────────────
    const containers = await client.talk(['/container/print']).catch(() => [] as Row[]);
    if (containers.some(c => /mikhmon/i.test(`${c.name ?? ''} ${c['root-dir'] ?? ''}`))) {
      const entries = await runScriptForResult(client, MIKHMON_PROBE).catch(() => '');
      if (entries === '1') add({ id: 'mikhmon-session-lost', area: 'MikHmon', severity: 'error', title: 'Session MikHmon effacée', detail: "La session du routeur a été supprimée dans MikHmon : il n'affiche plus les tickets ni n'en génère. Correctif : la restaurer automatiquement.", fix: 'mikhmon-session' });
      else if (Number(entries) >= 2) add({ id: 'mikhmon-session-ok', area: 'MikHmon', severity: 'ok', title: 'Session MikHmon présente', detail: 'La configuration de MikHmon contient bien la session du routeur.' });
    }

    const errors = checks.filter(c => c.severity === 'error').length;
    const warns = checks.filter(c => c.severity === 'warn').length;
    return { identity, score: Math.max(0, 100 - errors * 15 - warns * 5), checks };
  });
}

/** Applique UNE réparation et renvoie un message lisible. */
export async function applyFix(transport: Transport, fix: FixId): Promise<string> {
  if (!transport.withClient) throw new Error('Transport sans session complète.');
  return transport.withClient(async client => {
    switch (fix) {
      case 'ntp':
        await client.talk(['/system/ntp/client/set', '=enabled=yes', '=servers=time.cloudflare.com,pool.ntp.org']);
        await client.talk(['/system/clock/set', '=time-zone-autodetect=yes']).catch(() => {});
        return 'Client NTP activé (time.cloudflare.com, pool.ntp.org) : l’heure se synchronise dans la minute.';
      case 'ticket-expiry': {
        const r = await rewriteIsoExpiryComments(client);
        return `Dates d’expiration réécrites au format attendu : ${JSON.stringify(r)}`;
      }
      case 'expiry-sweep': {
        const r = await repairExpirySweeps(client);
        return `Balayages d’expiration réparés : ${JSON.stringify(r)}`;
      }
      case 'mikhmon-sales': {
        const r = await rewriteIsoSalesRecords(client);
        const version = ((await client.talk(['/system/resource/print']))[0] ?? {}).version ?? '';
        const sweep = overwritesSaleOwner(version) ? await ensureOwnerSweep(client) : null;
        return `${r.rewritten} vente(s) remise(s) au format MikHmon${r.failed ? `, ${r.failed} échec(s)` : ''}${sweep === 'added' ? ` ; tâche « ${OWNER_SWEEP_NAME} » posée pour les ventes à venir` : ''}. Rouvrez Rapports dans MikHmon.`;
      }
      case 'wifi-optimize':
        return (await optimizeWifiThroughput(client)).summary;
      case 'throughput-optimize':
        return (await optimizeRouterThroughput(client)).summary;
      case 'speed-test':
        return (await runRouterSpeedTest(client, { timeoutMs: 90000 })).summary;
      case 'mikhmon-credentials': {
        const out = await runScriptForResult(client, MIKHMON_LOGIN_PROBE);
        if (out === 'absent') throw new Error('Aucun conteneur MikHmon sur ce routeur.');
        const [user, enc] = out.split('|');
        if (!enc) throw new Error('config.php de MikHmon introuvable ou illisible (conteneur arrêté ?).');
        const password = mikhmonLegacyDecrypt(enc);
        if (password === '1234') return `Identifiant : ${user} · mot de passe : 1234 (celui d’usine — à changer dans MikHmon › Admin Settings).`;
        return password !== null
          ? `Identifiant : ${user} · mot de passe : ${password}`
          : `Identifiant : ${user} · mot de passe chiffré par MikHmon lui-même (format v2), illisible hors du conteneur. Utilisez « Restaurer la session » pour en reposer un connu.`;
      }
      case 'mikhmon-reinstall': {
        // Recrée le conteneur (re-pull de l'image) sur stockage persistant, même
        // nom / image / interface. La session est ensuite reposée.
        const r = await migrateMikhmonToFlash(client, { force: true, maxWaitMs: 240000 });
        if (r.status === 'no-container') throw new Error('Aucun conteneur MikHmon à réinstaller : installez-le depuis le SaaS (auto-setup).');
        if (r.status === 'failed') throw new Error(r.message);
        return `${r.message}${r.status === 'pulling' ? ' Téléchargement de l’image en cours : relancez le diagnostic dans 2 minutes, puis « Restaurer la session ».' : ' Pensez à « Restaurer la session » si MikHmon ne montre plus vos tickets.'}`;
      }
      case 'wifi-dfs': {
        const r = await fixWifiDfs(client);
        return r.applied.length ? `Radios débloquées : ${r.applied.join(', ')}.` : (r.note ?? 'Aucune radio à corriger.');
      }
      case 'wifi-enable':
      case 'wifi-unhide': {
        const state = await readWifiState(client);
        const base = state.api === 'wifi' ? '/interface/wifi' : '/interface/wireless';
        const rows = await client.talk([`${base}/print`]);
        let n = 0;
        for (const r of rows) {
          if (fix === 'wifi-enable' && yes(r.disabled)) { await client.talk([`${base}/enable`, `=numbers=${r['.id']}`]); n++; }
          if (fix === 'wifi-unhide') {
            await client.talk([`${base}/set`, `=numbers=${r['.id']}`, state.api === 'wifi' ? '=configuration.hide-ssid=no' : '=hide-ssid=no']).catch(() => {});
            n++;
          }
        }
        return fix === 'wifi-enable' ? `${n} radio(s) réactivée(s).` : `SSID rendu visible sur ${n} radio(s).`;
      }
      case 'nat': {
        const wan = await findWan(client);
        if (!wan) throw new Error('Port WAN introuvable : impossible de poser le NAT sans risque.');
        await client.talk(['/ip/firewall/nat/add', '=chain=srcnat', `=out-interface=${wan}`, '=action=masquerade', `=comment=${AGENT_COMMENT}`]);
        return `NAT (masquerade) recréé sur ${wan}.`;
      }
      case 'dns-remote':
        await client.talk(['/ip/dns/set', '=allow-remote-requests=yes']);
        return 'DNS ouvert aux clients du réseau local.';
      case 'dhcp-enable': {
        const rows = await client.talk(['/ip/dhcp-server/print']);
        for (const r of rows) if (yes(r.disabled)) await client.talk(['/ip/dhcp-server/enable', `=numbers=${r['.id']}`]);
        return 'Serveur(s) DHCP réactivé(s).';
      }
      case 'hotspot-enable': {
        const rows = await client.talk(['/ip/hotspot/print']);
        for (const r of rows) if (yes(r.disabled)) await client.talk(['/ip/hotspot/enable', `=numbers=${r['.id']}`]);
        return 'Serveur(s) hotspot réactivé(s).';
      }
      case 'wan-dhcp': {
        const wan = await findWan(client);
        if (!wan) throw new Error('Port WAN (ether1) introuvable.');
        await client.talk(['/ip/dhcp-client/add', `=interface=${wan}`, '=disabled=no', `=comment=${AGENT_COMMENT}`]);
        return `Client DHCP recréé sur ${wan} : le routeur va redemander une adresse à la box.`;
      }
      case 'mikhmon-start': {
        const rows = await client.talk(['/container/print']);
        const mk = rows.find(c => /mikhmon/i.test(`${c.name ?? ''} ${c['root-dir'] ?? ''}`));
        if (!mk?.['.id']) throw new Error('Conteneur MikHmon introuvable.');
        await client.talk(['/container/start', `=numbers=${mk['.id']}`]);
        return 'Conteneur MikHmon démarré.';
      }
      case 'mikhmon-session': {
        // Compte API propre à MikHmon, joignable SEULEMENT depuis le réseau des
        // conteneurs. Son mot de passe est régénéré à chaque restauration.
        const password = randomBytes(12).toString('base64url');
        const users = await client.talk(['/user/print', `?name=${MIKHMON_API_USER}`]);
        if (users[0]?.['.id']) {
          await client.talk(['/user/set', `=numbers=${users[0]['.id']}`, `=password=${password}`, '=address=11.11.11.0/28']);
        } else {
          await client.talk(['/user/add', `=name=${MIKHMON_API_USER}`, '=group=full', `=password=${password}`, '=address=11.11.11.0/28', `=comment=${AGENT_COMMENT}`]);
        }
        // MikHmon (11.11.11.11) doit pouvoir joindre l'API du routeur.
        await ensureApiReachableFromContainer(client, '11.11.11.11').catch(() => {});
        // Même script que l'installation SafeLinkHub : relit le hotspot sur la
        // carte, CONSERVE le mot de passe d'ouverture de MikHmon, réécrit la
        // session puis redémarre le conteneur.
        await runScriptForResult(client, `${buildMikhmonResyncRos('SafeLinkHub', MIKHMON_API_USER, password)}\n:local slhOut "ok";`, 90000);
        const entries = await runScriptForResult(client, MIKHMON_PROBE).catch(() => '');
        if (Number(entries) < 2) throw new Error('Session non restaurée : vérifiez qu’un profil hotspot existe et que le conteneur MikHmon est démarré.');
        return 'Session MikHmon restaurée : rouvrez MikHmon, la session « SafeLinkHub » est de retour avec les tickets.';
      }
    }
  });
}

/** Réparations sans geste sur site, applicables d'un coup. */
export const SAFE_FIXES: readonly FixId[] = ['ntp', 'expiry-sweep', 'ticket-expiry', 'mikhmon-sales', 'wifi-enable', 'wifi-unhide', 'wifi-dfs', 'dns-remote', 'dhcp-enable', 'hotspot-enable', 'mikhmon-start', 'mikhmon-session'];
/** Actions du menu Maintenance : jamais lancées par « Réparer tout ». */
export const MAINTENANCE_ACTIONS: readonly FixId[] = ['wifi-optimize', 'throughput-optimize', 'speed-test', 'mikhmon-credentials', 'mikhmon-session', 'mikhmon-reinstall'];
export type { AuditFinding };
