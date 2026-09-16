// ============ GÉNÉRATEUR DUAL WAN STARLINK — nœud Code n8n ============
// Miroir de docs/n8n/dualwan-workflow.json (nœud « Générer la config »),
// exécuté tel quel par test/n8n-dualwan-generator.test.mjs.
// Entrée : $input = sortie SSH « Pré-vérification » (stdout balisé ##…),
//          $('Valider la demande') = demande normalisée.
// Sortie : le script RouterOS en forme « exec » (UNE commande complète par
// ligne, c'est ce que le canal exec SSH de RouterOS accepte — un « /ip
// firewall mangle » seul sur sa ligne n'ouvre PAS de contexte), déjà
// dédupliqué contre ce qui existe sur le routeur (rejouable).
const req = $('Valider la demande').first().json;
const pre = $input.first().json;
const raw = String(pre.stdout || '') + '\n' + String(pre.stderr || '');

// ---------- lecture de la pré-vérification ----------
const sections = {};
let cur = null;
for (const line of raw.split('\n')) {
  const m = line.match(/^##([A-Z]+)\s*$/);
  if (m) { cur = m[1]; sections[cur] = []; continue; }
  if (cur && line.trim()) sections[cur].push(line.trim());
}
const need = ['VERSION', 'IFACE', 'BRIDGEPORT', 'DHCP', 'NAT', 'MANGLE', 'ROUTE', 'RTABLE', 'FILTER', 'ALIST', 'DNS'];
const absent = need.filter((s) => !sections[s]);
if (absent.length) throw new Error(`Pré-vérification incomplète (sections ${absent.join(', ')}) : ${raw.slice(0, 300)}`);
const ver = (sections.VERSION.join(' ').match(/version:\s*(\d+)\.(\d+)/) || []).slice(1).map(Number);
if (!ver.length) throw new Error('Version RouterOS illisible dans la pré-vérification');
const v7 = ver[0] >= 7;

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
const has = (sec, test) => (sections[sec] || []).some((l) => (test instanceof RegExp ? test.test(l) : test(l)));
// « print terse » n'entoure pas les commentaires de guillemets : on ancre sur
// le mot-clé suivant pour ne pas confondre « NAT WAN1 » et « NAT WAN1 bis ».
const byComment = (c) => new RegExp(`(^|\\s)comment=${esc(c)}(\\s+[\\w-]+=|$)`);
const kv = (k, v) => new RegExp(`(^|\\s)${k}=${esc(v)}(\\s|$)`);
const field = (l, k) => (l.match(new RegExp(`(^|\\s)${k}=(\\S+)`)) || [])[2];

// ---------- modèles, ratio, seaux ----------
// Parts proportionnelles aux débits, plafonnées à 8 seaux : 400/150 → 3:1
// (4 seaux), 400/400 → 1:1 (2 seaux), 150/400 → 1:3.
const m1 = req.wan1.mbps, m2 = req.wan2.mbps;
const r = Math.min(7, Math.max(1, Math.round(Math.max(m1, m2) / Math.min(m1, m2))));
const buckets = r + 1;
const wan1Buckets = m1 >= m2 ? r : 1;
const assign = Array.from({ length: buckets }, (_, i) => (i < wan1Buckets ? 1 : 2));
const ratio = `${wan1Buckets}:${buckets - wan1Buckets}`;
const same = req.wan1.key === req.wan2.key;
const wans = [
  { n: 1, name: req.wan1_interface, src: 'ether1', model: req.wan1 },
  { n: 2, name: req.wan2_interface, src: 'ether2', model: req.wan2 },
].map((w) => ({
  ...w,
  ifaceComment: same ? `Starlink ${w.model.label} #${w.n}` : `Starlink ${w.model.label}`,
  dhcpComment: same ? `WAN${w.n} ${w.model.short} #${w.n}` : `WAN${w.n} ${w.model.short} ${w.model.mbps}M`,
}));

// ---------- état des interfaces ----------
const ifaces = sections.IFACE.map((l) => ({ name: field(l, 'name'), def: field(l, 'default-name') })).filter((i) => i.name);
const bridgePorts = sections.BRIDGEPORT.map((l) => field(l, 'interface')).filter(Boolean);
const complet = req.mode === 'complet';
const lanMatch = req.lan_interface ? `in-interface=${req.lan_interface}` : 'in-interface-list=LAN';
if (req.lan_interface && !ifaces.some((i) => i.name === req.lan_interface)) {
  throw new Error(`Interface LAN « ${req.lan_interface} » introuvable sur le routeur`);
}
// detach_wan2_from_bridge : en complet, les deux ports peuvent encore être dans
// le bridge ; en complement seul WAN2 est concerné (WAN1 est déjà l'uplink) et
// on accepte alors qu'il porte encore son nom d'usine (ether2) — on le sort du
// bridge et on le renomme, comme en complet.
const detachable = (w) => req.detach_wan2_from_bridge && (complet || w.n === 2);
for (const w of wans) {
  let phys = complet ? ifaces.find((i) => i.def === w.src) : ifaces.find((i) => i.name === w.name);
  if (!phys && detachable(w)) phys = ifaces.find((i) => i.def === w.src);
  if (!phys) {
    throw new Error(complet
      ? `Port ${w.src} introuvable (pas un hAP ax2 ?)`
      : `Interface WAN${w.n} « ${w.name} » absente : en mode complement, le port doit déjà être sorti du bridge et renommé (ex. /interface bridge port remove [find interface=ether2] ; /interface ethernet set [find default-name=ether2] name=${w.name})${w.n === 2 ? ', ou relancez avec detach_wan2_from_bridge=true' : ''}`);
  }
  w.current = phys.name;
  w.inBridge = bridgePorts.includes(phys.name);
  if (w.inBridge && !detachable(w)) {
    throw new Error(`« ${phys.name} » est encore un port du bridge : retirez-le (/interface bridge port remove [find interface=${phys.name}])${complet || w.n === 2 ? ' ou relancez avec detach_wan2_from_bridge=true' : ''}`);
  }
}

// ---------- génération ----------
const lines = [];
const H = (t) => lines.push({ text: `# ---------- ${t} ----------`, hdr: true });
const emit = (text, skip) => lines.push({ text, skip: skip ? 'déjà présent' : null });
const toApply = (w) => complet || w.n === 2; // complement : on n'ajoute que WAN2

const toRename = wans.filter((w) => complet || (w.n === 2 && w.current !== w.name));
if (toRename.length) {
  H('0. Renommage interfaces');
  for (const w of toRename) {
    if (w.inBridge) emit(`/interface bridge port remove [find interface=${w.current}]`);
    emit(`/interface ethernet set [find default-name=${w.src}] name=${w.name} comment="${w.ifaceComment}"`, w.current === w.name);
  }
}

H('1. WAN : DHCP clients');
for (const w of wans.filter(toApply)) {
  emit(`/ip dhcp-client add interface=${w.name} disabled=no add-default-route=yes use-peer-dns=no default-route-distance=${w.n} comment="${w.dhcpComment}"`,
    has('DHCP', kv('interface', w.name)));
}

H('2. NAT');
for (const w of wans.filter(toApply)) {
  emit(`/ip firewall nat add chain=srcnat out-interface=${w.name} action=masquerade comment="NAT WAN${w.n}"`,
    has('NAT', byComment(`NAT WAN${w.n}`)) || has('NAT', (l) => /action=masquerade/.test(l) && kv('out-interface', w.name).test(l)));
}

H(`3. PCC - ratio ${ratio} (${buckets} seaux)`);
// RouterOS refuse un dst-address= répété dans une même règle (« expected end
// of command ») : l'exclusion des destinations privées (CGNAT Starlink
// 100.64.0.0/10 inclus) passe par une address-list, même sémantique.
const LIST = 'slh-pcc-exclude';
for (const net of ['192.168.0.0/16', '10.0.0.0/8', '100.64.0.0/10', '172.16.0.0/12']) {
  emit(`/ip firewall address-list add list=${LIST} address=${net} comment="PCC exclusion"`,
    has('ALIST', (l) => kv('list', LIST).test(l) && kv('address', net).test(l)));
}
if (v7) {
  for (const n of [1, 2]) emit(`/routing table add name=to-WAN${n} fib`, has('RTABLE', kv('name', `to-WAN${n}`)));
}
const pccComments = assign.map((x, i) => `PCC ${i + 1}/${buckets} -> WAN${x}`);
const foreign = sections.MANGLE.filter((l) => /per-connection-classifier=/.test(l) && !pccComments.some((c) => byComment(c).test(l)));
if (foreign.length) {
  throw new Error(`${foreign.length} règle(s) PCC étrangère(s) au plan ${ratio} déjà en place — retirez-les avant de relancer : ${foreign.map((l) => l.slice(0, 90)).join(' | ')}`);
}
assign.forEach((x, i) => {
  emit(`/ip firewall mangle add chain=prerouting connection-mark=no-mark dst-address-list=!${LIST} ${lanMatch} per-connection-classifier=both-addresses-and-ports:${buckets}/${i} action=mark-connection new-connection-mark=WAN${x} passthrough=yes comment="${pccComments[i]}"`,
    has('MANGLE', byComment(pccComments[i])));
});
for (const n of [1, 2]) {
  emit(`/ip firewall mangle add chain=prerouting connection-mark=WAN${n} action=mark-routing new-routing-mark=to-WAN${n} passthrough=yes`,
    has('MANGLE', (l) => /action=mark-routing/.test(l) && kv('new-routing-mark', `to-WAN${n}`).test(l)));
}

H('4. Routes + failover');
// RouterOS 7 : « routing-mark= » n'existe plus sur /ip route, c'est routing-table=
const rt = v7 ? 'routing-table' : 'routing-mark';
for (const [gw, table, dist, c] of [
  [wans[0].name, 'to-WAN1', 1, 'Marquee WAN1'], [wans[1].name, 'to-WAN1', 2, 'Backup WAN1'],
  [wans[1].name, 'to-WAN2', 1, 'Marquee WAN2'], [wans[0].name, 'to-WAN2', 2, 'Backup WAN2'],
]) {
  emit(`/ip route add gateway=${gw} ${rt}=${table} check-gateway=ping distance=${dist} comment="${c}"`,
    has('ROUTE', byComment(c)) || has('ROUTE', (l) => kv(rt, table).test(l) && kv('gateway', gw).test(l) && kv('distance', String(dist)).test(l)));
}

if (complet) {
  H('5. FastTrack');
  emit('/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack"',
    has('FILTER', /action=fasttrack-connection/));
}

H('6. DNS');
emit('/ip dns set servers=1.1.1.1,9.9.9.9 allow-remote-requests=yes',
  has('DNS', /servers:\s*1\.1\.1\.1,9\.9\.9\.9(\s|$)/) && has('DNS', /allow-remote-requests:\s*yes/));

const applied = lines.filter((l) => !l.hdr && !l.skip).map((l) => l.text);
const skipped = lines.filter((l) => l.skip).map((l) => l.text);
const script = lines.filter((l) => l.hdr || !l.skip).map((l) => l.text).join('\n');
const plan = { cas: req.cas, mode: req.mode, ratio, buckets, assign: assign.map((x) => `WAN${x}`), wan1: wans[0].name, wan2: wans[1].name, lan: lanMatch, routeros: ver.join('.') };
console.log(JSON.stringify({ step: 'generate', router_id: req.router_id, plan, to_apply: applied.length, skipped: skipped.length }));
return [{ json: { ...req, plan, script, to_apply: applied.length, applied, skipped, expected: { pcc: buckets, routes: 4, nat: 2, dhcp: 2 } } }];
