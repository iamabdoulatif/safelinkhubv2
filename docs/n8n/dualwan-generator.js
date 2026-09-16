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
const need = ['VERSION', 'IFACE', 'BRIDGEPORT', 'LISTM', 'DHCP', 'NAT', 'MANGLE', 'ROUTE', 'RTABLE', 'FILTER', 'ALIST', 'DNS'];
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

// Nom ET commentaire (« Starlink Standard V4 », « Starlink Mini ») sur les
// deux WAN, dans les deux modes : un port déjà bien nommé reçoit juste son
// commentaire s'il lui manque (WAN1 d'un uniwan repris en complement compris).
H('0. Interfaces WAN : nom et commentaire');
for (const w of wans) {
  if (w.current !== w.name) {
    if (w.inBridge) emit(`/interface bridge port remove [find interface=${w.current}]`);
    emit(`/interface ethernet set [find default-name=${w.src}] name=${w.name} comment="${w.ifaceComment}"`);
  } else {
    emit(`/interface ethernet set [find default-name=${w.src}] comment="${w.ifaceComment}"`,
      has('IFACE', (l) => kv('name', w.name).test(l) && byComment(w.ifaceComment).test(l)));
  }
}

// Sondes de bascule : chaque WAN a SA route hôte vers un résolveur public
// (1.1.1.1 par WAN1, 9.9.9.9 par WAN2, scope=10) et les routes par défaut
// pointent sur ces IP (passerelle récursive) avec check-gateway=ping. Un
// « gateway=<interface> » + ping ne marche pas sur un WAN Ethernet (relevé sur
// HTSPT-BETON : les 4 routes restaient inactives, PCC sans effet) et pinger la
// box Starlink ne dit rien de l'Internet derrière. Le client DHCP renseigne la
// passerelle de sa sonde à chaque bail (script), donc pas d'IP en dur.
const PROBE = { 1: '1.1.1.1', 2: '9.9.9.9' };
const probeComment = (n) => `Sonde WAN${n}`;
const dhcpScript = (n) => `:if (\\$bound=1) do={ /ip route set [find comment=\\"${probeComment(n)}\\"] gateway=\\$\\"gateway-address\\" }`;
const dhcpLine = (w) => sections.DHCP.find((l) => kv('interface', w.name).test(l));
// La passerelle du bail suit « status=bound » ; ne JAMAIS prendre le premier
// gateway= de la ligne : le script du client contient gateway=$"gateway-address".
const dhcpGateway = (w) => { const l = dhcpLine(w); const m = l && l.match(/\sstatus=bound\b.*?\sgateway=(\d+\.\d+\.\d+\.\d+)(\s|$)/); return m ? m[1] : null; };

H('1. WAN : DHCP clients (route par défaut en secours lointain, sonde mise à jour à chaque bail)');
for (const w of wans) {
  const l = dhcpLine(w);
  const settings = `add-default-route=yes default-route-distance=${10 + w.n} script="${dhcpScript(w.n)}"`;
  if (!l) {
    if (toApply(w)) emit(`/ip dhcp-client add interface=${w.name} disabled=no use-peer-dns=no ${settings} comment="${w.dhcpComment}"`);
    continue;
  }
  // Client existant (uniwan compris) : on aligne seulement distance + script.
  emit(`/ip dhcp-client set [find interface=${w.name}] ${settings}`,
    kv('default-route-distance', String(10 + w.n)).test(l) && l.includes(probeComment(w.n)));
}

H('1b. Liste WAN (durcissement raw/filter en in-interface-list=WAN)');
for (const w of wans.filter(toApply)) {
  emit(`/interface list member add list=WAN interface=${w.name}`,
    has('LISTM', (l) => kv('list', 'WAN').test(l) && kv('interface', w.name).test(l)));
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
// HSPT-FOUANGA, 16/09/2026 : 385 connexions TCP en syn-recv, 0 établie, plus
// de pop-up de portail. Deux fuites de la même cause — un paquet marqué est
// routé par la table to-WANx, qui n'a qu'une route par défaut :
// 1. mark-routing sans in-interface marquait aussi les RÉPONSES arrivant du
//    WAN → renvoyées au WAN au lieu du client (d'où ${lanMatch}).
// 2. Un paquet marqué puis redirigé par le hotspot vers le routeur (DNS
//    53→64872, HTTP 80→64874 des clients non connectés) partait au WAN au
//    lieu d'être livré localement → ni page de connexion ni pop-up. D'où
//    hotspot=auth (seuls les clients connectés sont répartis, le walled-garden
//    passe par main) et le DNS soustrait au PCC en tête de chaîne.
const hotspot = has('NAT', /(^|\s)chain=hotspot(\s|$)/);
const pccAuth = hotspot ? ' hotspot=auth' : '';
const dnsBypass = (proto) => `/ip firewall mangle add chain=prerouting ${lanMatch} protocol=${proto} dst-port=53 action=accept comment="PCC DNS local ${proto}"`;
const firstPcc = sections.MANGLE.some((l) => byComment(pccComments[0]).test(l));
for (const proto of ['udp', 'tcp']) {
  // Routeur déjà réparti : la règle doit passer DEVANT le PCC existant.
  const placed = firstPcc ? dnsBypass(proto).replace(' comment=', ` place-before=[find comment="${pccComments[0]}"] comment=`) : dnsBypass(proto);
  emit(placed, has('MANGLE', byComment(`PCC DNS local ${proto}`)));
}
assign.forEach((x, i) => {
  const l = sections.MANGLE.find((x) => byComment(pccComments[i]).test(x));
  if (l && hotspot && !kv('hotspot', 'auth').test(l)) {
    return emit(`/ip firewall mangle set [find comment="${pccComments[i]}"] hotspot=auth`);
  }
  emit(`/ip firewall mangle add chain=prerouting connection-mark=no-mark dst-address-list=!${LIST} ${lanMatch}${pccAuth} per-connection-classifier=both-addresses-and-ports:${buckets}/${i} action=mark-connection new-connection-mark=WAN${x} passthrough=yes comment="${pccComments[i]}"`, !!l);
});
for (const n of [1, 2]) {
  const l = sections.MANGLE.find((x) => /action=mark-routing/.test(x) && kv('new-routing-mark', `to-WAN${n}`).test(x));
  const [k, v] = lanMatch.split('=');
  if (l && !kv(k, v).test(l)) {
    emit(`/ip firewall mangle set [find action=mark-routing new-routing-mark=to-WAN${n}] ${lanMatch}`);
  } else {
    emit(`/ip firewall mangle add chain=prerouting connection-mark=WAN${n} ${lanMatch} action=mark-routing new-routing-mark=to-WAN${n} passthrough=yes`, !!l);
  }
}

H('4. Routes + failover (passerelles récursives, sondées par ping)');
// RouterOS 7 : « routing-mark= » n'existe plus sur /ip route, c'est routing-table=
const rt = v7 ? 'routing-table' : 'routing-mark';
// Une route est repérée par son commentaire : absente → add ; présente avec
// une autre passerelle (ancienne forme gateway=<interface>, ou bail DHCP qui a
// changé de box) → set. Rejouable, et migre les routeurs déjà configurés.
const route = (c, attrs, gw) => {
  const l = sections.ROUTE.find((x) => byComment(c).test(x));
  if (!l) return emit(`/ip route add ${attrs} gateway=${gw} comment="${c}"`);
  const same = `${attrs} gateway=${gw}`.split(' ').every((kv) => { const [k, v] = kv.split('='); return field(l, k) === v; });
  emit(`/ip route set [find comment="${c}"] ${attrs} gateway=${gw}`, same);
};
for (const w of wans) {
  // Sonde : passerelle = celle du bail si connu, sinon l'interface en attendant le script DHCP.
  route(probeComment(w.n), `dst-address=${PROBE[w.n]}/32 scope=10`, dhcpGateway(w) || w.name);
}
for (const [n, table, dist, c] of [
  [1, 'main', 1, 'Main WAN1'], [2, 'main', 2, 'Main WAN2'],
  [1, 'to-WAN1', 1, 'Marquee WAN1'], [2, 'to-WAN1', 2, 'Backup WAN1'],
  [2, 'to-WAN2', 1, 'Marquee WAN2'], [1, 'to-WAN2', 2, 'Backup WAN2'],
]) {
  // target-scope=11 : en v7 la passerelle récursive ne se résout que par une
  // route de scope STRICTEMENT inférieur (sonde scope=10) — à 10 (défaut) la
  // route reste inactive, vérifié sur 7.24.
  route(c, `dst-address=0.0.0.0/0${table === 'main' ? '' : ` ${rt}=${table}`} check-gateway=ping distance=${dist} target-scope=11`, PROBE[n]);
}

if (complet) {
  H('5. FastTrack');
  emit('/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related comment="FastTrack"',
    has('FILTER', /action=fasttrack-connection/));
}

H('6. DNS');
// Pré-vérification en « :put [/ip dns get …] » : « print » replie la liste
// des serveurs sur plusieurs lignes selon la version (7.24), imprévisible.
emit('/ip dns set servers=1.1.1.1,9.9.9.9 allow-remote-requests=yes',
  has('DNS', /^servers=1\.1\.1\.1;9\.9\.9\.9$/) && has('DNS', /^allow-remote-requests=true$/));

const applied = lines.filter((l) => !l.hdr && !l.skip).map((l) => l.text);
const skipped = lines.filter((l) => l.skip).map((l) => l.text);
const script = lines.filter((l) => l.hdr || !l.skip).map((l) => l.text).join('\n');
const plan = { cas: req.cas, mode: req.mode, ratio, buckets, assign: assign.map((x) => `WAN${x}`), wan1: wans[0].name, wan2: wans[1].name, lan: lanMatch, routeros: ver.join('.') };
console.log(JSON.stringify({ step: 'generate', router_id: req.router_id, plan, to_apply: applied.length, skipped: skipped.length }));
return [{ json: { ...req, plan, script, to_apply: applied.length, applied, skipped, expected: { pcc: buckets, routes: 6, nat: 2, dhcp: 2 } } }];
