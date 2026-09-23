import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

// Exécute les nœuds Code du workflow Dual WAN hors n8n (docs/n8n/dualwan-*).
const wf = JSON.parse(readFileSync(new URL("../docs/n8n/dualwan-workflow.json", import.meta.url), "utf8"));
const node = (name) => wf.nodes.find((n) => n.name === name);
const generatorSrc = readFileSync(new URL("../docs/n8n/dualwan-generator.js", import.meta.url), "utf8");

function runValidate(body) {
  const fn = new Function("$input", "console", node("Valider la demande").parameters.jsCode);
  return fn({ first: () => ({ json: { body } }) }, { log() {} })[0].json;
}
function runGenerate(req, stdout) {
  const fn = new Function("$", "$input", "console", generatorSrc);
  return fn(() => ({ first: () => ({ json: req }) }), { first: () => ({ json: { stdout, stderr: "", code: 0 } }) }, { log() {} })[0].json;
}

function runBilan(g, stdout) {
  const fn = new Function("$", "$input", "console", node("Bilan").parameters.jsCode);
  return fn(() => ({ first: () => ({ json: g }) }), { first: () => ({ json: { stdout, stderr: "", code: 0 } }) }, { log() {} })[0].json.notification;
}

// Sortie « print terse » d'un hAP ax2 (forme relevée sur HSPT-LEGRAND, RouterOS 7.21).
const sec = (parts) => Object.entries(parts).map(([k, v]) => `##${k}\n${v}`).join("\n") + "\n##END";
const IF_FRESH = `0 R name=ether1 default-name=ether1 type=ether mtu=1500\n1 R name=ether2 default-name=ether2 type=ether mtu=1500\n2 R name=bridge type=bridge`;
const IF_UNIWAN = `0 R comment=Starlink Standard V3 name=E1-WAN-FAI default-name=ether1 type=ether\n1 R comment=Starlink Mini name=E2-WAN-FAI default-name=ether2 type=ether\n2 R name=HOTSPOT type=bridge`;
const base = { VERSION: "version: 7.21.1 (stable)\nboard-name: hAP ax^2", BRIDGEPORT: "", LISTM: "", DHCP: "", NAT: "", MANGLE: "", ROUTE: "", RTABLE: "", FILTER: "", ALIST: "", DNS: "servers=8.8.8.8\nallow-remote-requests=false" };
const fresh = sec({ ...base, IFACE: IF_FRESH });

const req = (over) => runValidate({ router_id: "r1", router_host: "relay.safelinkhub.io", router_port: 30022, router_user: "safelinkhub-api", router_pass: "x", cas: "cas1", mode: "complet", ...over });

describe("nœud n8n Générer la config (dual WAN Starlink)", () => {
  it("le JSON du workflow embarque exactement dualwan-generator.js", () => {
    assert.equal(node("Générer la config").parameters.jsCode, generatorSrc);
    for (const n of wf.nodes.filter((n) => n.type === "n8n-nodes-base.ssh")) {
      assert.ok(n.parameters.command.startsWith("=\n"), `${n.name} : la commande doit commencer par un saut de ligne (préfixe cd '/' ; de node-ssh)`);
    }
  });

  it("cas1 complet : ratio 3:1, 4 seaux (4/0..4/2 → WAN1, 4/3 → WAN2), les 6 sections", () => {
    const g = runGenerate(req({}), fresh);
    assert.equal(g.plan.ratio, "3:1");
    assert.deepEqual(g.plan.assign, ["WAN1", "WAN1", "WAN1", "WAN2"]);
    const pcc = g.applied.filter((l) => l.includes("per-connection-classifier"));
    assert.equal(pcc.length, 4);
    assert.match(pcc[2], /both-addresses-and-ports:4\/2 action=mark-connection new-connection-mark=WAN1 .*comment="PCC 3\/4 -> WAN1"/);
    assert.match(pcc[3], /both-addresses-and-ports:4\/3 action=mark-connection new-connection-mark=WAN2 .*comment="PCC 4\/4 -> WAN2"/);
    assert.ok(pcc.every((l) => l.includes("dst-address-list=!slh-pcc-exclude in-interface-list=LAN")));
    assert.ok(g.applied.includes('/interface ethernet set [find default-name=ether1] name=E1-WAN-FAI comment="Starlink Standard V3"'));
    assert.ok(g.applied.includes('/ip dhcp-client add interface=E2-WAN-FAI disabled=no use-peer-dns=no add-default-route=yes default-route-distance=12 script=":if (\\$bound=1) do={ /ip route set [find comment=\\"Sonde WAN2\\"] gateway=\\$\\"gateway-address\\" }" comment="WAN2 Mini 150M"'));
    assert.ok(g.applied.includes('/interface list member add list=WAN interface=E2-WAN-FAI'));
    assert.ok(g.applied.includes('/routing table add name=to-WAN1 fib'));
    // Sondes récursives : route hôte par WAN (passerelle = l'interface tant que le bail est inconnu), défauts vers 1.1.1.1 / 9.9.9.9.
    assert.ok(g.applied.includes('/ip route add dst-address=9.9.9.9/32 scope=10 gateway=E2-WAN-FAI comment="Sonde WAN2"'));
    assert.ok(g.applied.includes('/ip route add dst-address=0.0.0.0/0 check-gateway=ping distance=2 target-scope=11 gateway=9.9.9.9 comment="Main WAN2"'));
    assert.ok(g.applied.includes('/ip route add dst-address=0.0.0.0/0 routing-table=to-WAN1 check-gateway=ping distance=2 target-scope=11 gateway=9.9.9.9 comment="Backup WAN1"'));
    assert.equal(g.applied.filter((l) => l.startsWith("/ip route add dst-address=0.0.0.0/0")).length, 6);
    assert.equal(g.expected.routes, 6);
    assert.ok(g.applied.some((l) => l.includes("action=fasttrack-connection")));
    assert.ok(g.applied.includes("/ip dns set servers=1.1.1.1,9.9.9.9 allow-remote-requests=yes"));
    assert.equal(g.expected.pcc, 4);
  });

  it("cas2 / cas3 : 1:1, 2 seaux, commentaires #1/#2 ; débits explicites → 150/400 = 1:3", () => {
    const g2 = runGenerate(req({ cas: "cas2" }), fresh);
    assert.equal(g2.plan.ratio, "1:1");
    assert.ok(g2.applied.some((l) => l.includes('per-connection-classifier=both-addresses-and-ports:2/1 action=mark-connection new-connection-mark=WAN2 passthrough=yes comment="PCC 2/2 -> WAN2"')));
    assert.ok(g2.applied.some((l) => l.includes('comment="WAN1 Standard #1"')));
    assert.ok(runGenerate(req({ cas: "cas3" }), fresh).applied.some((l) => l.includes('comment="Starlink Mini #2"')));
    // cas4 = le Mini en WAN1 : le Standard, plus rapide, prend 3 seaux sur 4.
    const g4 = runGenerate(req({ cas: "cas4" }), fresh);
    assert.equal(g4.plan.ratio, "1:3");
    assert.deepEqual(g4.plan.assign, ["WAN1", "WAN2", "WAN2", "WAN2"]);
    assert.ok(g4.applied.some((l) => l.includes('comment="Starlink Mini"')));
    assert.ok(g4.applied.some((l) => l.includes('comment="WAN2 Standard 400M"')));
    const inv = runGenerate(req({ cas: "cas1", wan1_mbps: 150, wan2_mbps: 400 }), fresh);
    assert.deepEqual(inv.plan.assign, ["WAN1", "WAN2", "WAN2", "WAN2"]);
    assert.equal(runGenerate(req({ wan1_mbps: 4000, wan2_mbps: 100 }), fresh).plan.buckets, 8); // plafond
  });

  it("complement sur un uniwan : ni renommage ni WAN1 ni FastTrack, in-interface=LAN du routeur", () => {
    const uniwan = sec({ ...base, IFACE: IF_UNIWAN, DHCP: "0 interface=E1-WAN-FAI add-default-route=yes default-route-distance=1 use-peer-dns=yes status=bound address=192.168.1.208/24 gateway=192.168.1.1", NAT: "0 chain=srcnat action=masquerade out-interface=E1-WAN-FAI", FILTER: "0 comment=defconf: fasttrack chain=forward action=fasttrack-connection connection-state=established,related" });
    const g = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT" }), uniwan);
    assert.ok(!g.applied.some((l) => /interface ethernet set|E1-WAN-FAI disabled=no|NAT WAN1|fasttrack|list=WAN interface=E1/.test(l)));
    // Le client DHCP WAN1 existant est seulement aligné (secours lointain + sonde), la passerelle du bail va dans la sonde.
    assert.ok(g.applied.some((l) => l.startsWith('/ip dhcp-client set [find interface=E1-WAN-FAI] add-default-route=yes default-route-distance=11 script=')));
    assert.ok(g.applied.includes('/ip route add dst-address=1.1.1.1/32 scope=10 gateway=192.168.1.1 comment="Sonde WAN1"'));
    assert.ok(g.applied.includes('/ip firewall nat add chain=srcnat out-interface=E2-WAN-FAI action=masquerade comment="NAT WAN2"'));
    assert.ok(g.applied.filter((l) => l.includes("per-connection-classifier")).every((l) => l.includes(" in-interface=HOTSPOT ")));
    assert.equal(g.applied.filter((l) => l.startsWith("/ip route add dst-address=0.0.0.0/0")).length, 6);
  });

  it("migration : routes déjà posées en gateway=<interface> → set vers la sonde, rien de doublé", () => {
    const old = sec({ ...base, IFACE: IF_UNIWAN, LISTM: "0 list=WAN interface=E1-WAN-FAI", DHCP: "0 name=client1 interface=E1-WAN-FAI add-default-route=yes default-route-distance=1 status=bound address=192.168.1.46/24 gateway=192.168.1.1\n1 I interface=E2-WAN-FAI add-default-route=yes default-route-distance=2 status=stopped",
      RTABLE: "0 name=to-WAN1 fib\n1 name=to-WAN2 fib",
      ROUTE: "3 Is comment=Marquee WAN1 dst-address=0.0.0.0/0 routing-table=to-WAN1 gateway=E1-WAN-FAI check-gateway=ping distance=1\n4 Is comment=Backup WAN1 dst-address=0.0.0.0/0 routing-table=to-WAN1 gateway=E2-WAN-FAI check-gateway=ping distance=2" });
    const g = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT" }), old);
    assert.ok(g.applied.includes('/ip route set [find comment="Marquee WAN1"] dst-address=0.0.0.0/0 routing-table=to-WAN1 check-gateway=ping distance=1 target-scope=11 gateway=1.1.1.1'));
    assert.ok(g.applied.includes('/ip route set [find comment="Backup WAN1"] dst-address=0.0.0.0/0 routing-table=to-WAN1 check-gateway=ping distance=2 target-scope=11 gateway=9.9.9.9'));
    assert.ok(g.applied.includes('/ip route add dst-address=0.0.0.0/0 routing-table=to-WAN2 check-gateway=ping distance=1 target-scope=11 gateway=9.9.9.9 comment="Marquee WAN2"'));
    assert.ok(!g.applied.some((l) => l.startsWith("/ip route add") && l.includes('comment="Marquee WAN1"')));
    assert.ok(!g.applied.some((l) => l.includes("routing table add")));
    const half = sec({ ...base, IFACE: IF_UNIWAN, RTABLE: "0 name=to-WAN1 fib\n1 name=to-WAN2 fib",
      ROUTE: "7 Is comment=Main WAN1 dst-address=0.0.0.0/0 routing-table=main gateway=1.1.1.1 check-gateway=ping distance=1 scope=30 target-scope=10" });
    assert.ok(runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT" }), half).applied.includes('/ip route set [find comment="Main WAN1"] dst-address=0.0.0.0/0 check-gateway=ping distance=1 target-scope=11 gateway=1.1.1.1'));
  });

  it("commentaire manquant sur un WAN déjà bien nommé → posé sans renommer, dans les deux modes", () => {
    const IF_NOCOMMENT = `0 R name=E1-WAN-FAI default-name=ether1 type=ether\n1 R comment=Starlink Mini name=E2-WAN-FAI default-name=ether2 type=ether\n2 R name=HOTSPOT type=bridge`;
    for (const mode of ["complement", "complet"]) {
      const g = runGenerate(req({ mode, lan_interface: "HOTSPOT" }), sec({ ...base, IFACE: IF_NOCOMMENT }));
      assert.ok(g.applied.includes('/interface ethernet set [find default-name=ether1] comment="Starlink Standard V3"'), mode);
      assert.ok(!g.applied.some((l) => /default-name=ether1\] name=/.test(l) || /default-name=ether2\] comment=/.test(l)), mode);
    }
  });

  it("complement + detach : ether2 encore d'usine dans le bridge → sorti, renommé, puis WAN2 seulement", () => {
    const IF_HOTSPOT = `0 R comment=Starlink Standard V3 name=E1-WAN-FAI default-name=ether1 type=ether\n1 R name=ether2 default-name=ether2 type=ether\n2 R name=HOTSPOT type=bridge`;
    const hotspot = sec({ ...base, IFACE: IF_HOTSPOT, BRIDGEPORT: "0 I interface=ether2 bridge=HOTSPOT" });
    assert.throws(() => runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT" }), hotspot), /E2-WAN-FAI » absente.*detach_wan2_from_bridge=true/);
    const g = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT", detach_wan2_from_bridge: true }), hotspot);
    assert.deepEqual(g.applied.slice(0, 2), ["/interface bridge port remove [find interface=ether2]", '/interface ethernet set [find default-name=ether2] name=E2-WAN-FAI comment="Starlink Mini"']);
    assert.ok(!g.applied.some((l) => /default-name=ether1|NAT WAN1|fasttrack/.test(l)));
    assert.ok(g.applied.some((l) => l.startsWith('/ip dhcp-client add interface=E2-WAN-FAI disabled=no use-peer-dns=no add-default-route=yes default-route-distance=12 script=')));
  });

  it("la passerelle du bail vient d'après status=bound, jamais du script du client DHCP", () => {
    const line = `0 name=client1 interface=E1-WAN-FAI add-default-route=yes default-route-distance=11 script=:if ($bound=1) do={ /ip route set [find comment="Sonde WAN1"] gateway=$"gateway-address" } status=bound address=192.168.1.46/24 gateway=192.168.1.1 dhcp-server=192.168.1.1`;
    const g = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT" }), sec({ ...base, IFACE: IF_UNIWAN, DHCP: line, ROUTE: "2 Is comment=Sonde WAN1 dst-address=1.1.1.1/32 routing-table=main gateway=0.0.0.0 scope=10 target-scope=10" }));
    assert.ok(g.applied.includes('/ip route set [find comment="Sonde WAN1"] dst-address=1.1.1.1/32 scope=10 gateway=192.168.1.1'));
    assert.ok(!g.applied.some((l) => l.includes("gateway-address\" }") && l.startsWith("/ip route")));
  });

  it("rejeu : tout ce qui existe est sauté, rien à appliquer", () => {
    const g1 = runGenerate(req({}), fresh);
    // Reconstitue un « print terse » à partir de ce qui vient d'être posé.
    const terse = (prefix) => g1.applied.filter((l) => l.startsWith(prefix)).map((l, i) => `${i} ${l.slice(prefix.length).replace(/"/g, "")}`).join("\n");
    const done = sec({
      ...base, IFACE: IF_UNIWAN, DHCP: terse("/ip dhcp-client add "), NAT: terse("/ip firewall nat add "), MANGLE: terse("/ip firewall mangle add "),
      ROUTE: terse("/ip route add "), LISTM: terse("/interface list member add "), RTABLE: "0 name=to-WAN1 fib\n1 name=to-WAN2 fib", FILTER: terse("/ip firewall filter add "), ALIST: terse("/ip firewall address-list add "),
      DNS: "servers=1.1.1.1;9.9.9.9\nallow-remote-requests=true",
    });
    const g2 = runGenerate(req({}), done);
    assert.equal(g2.to_apply, 0, g2.applied.join("\n"));
    assert.equal(g2.skipped.length, g1.applied.length);
  });

  /* HSPT-FOUANGA (16/09/2026) : mark-routing sans in-interface renvoyait les
     réponses au WAN (385 TCP en syn-recv, 0 établie) et les redirections du
     hotspot vers le routeur (DNS, page de connexion) partaient au WAN → plus
     de pop-up. */
  it("routeur à hotspot : PCC réservé aux clients connectés, DNS soustrait, mark-routing borné au LAN", () => {
    const hs = sec({ ...base, IFACE: IF_UNIWAN, NAT: "0 D chain=hotspot action=jump jump-target=pre-hotspot\n1 D chain=hotspot action=redirect to-ports=64872 protocol=udp dst-port=53" });
    const g = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT" }), hs);
    assert.ok(g.applied.filter((l) => l.includes("per-connection-classifier")).every((l) => l.includes(" in-interface=HOTSPOT hotspot=auth ")));
    assert.ok(g.applied.includes('/ip firewall mangle add chain=prerouting in-interface=HOTSPOT protocol=udp dst-port=53 action=accept comment="PCC DNS local udp"'));
    assert.ok(g.applied.includes("/ip firewall mangle add chain=prerouting connection-mark=WAN2 in-interface=HOTSPOT action=mark-routing new-routing-mark=to-WAN2 passthrough=yes"));
    // Le DNS passe AVANT le PCC dans le script.
    assert.ok(g.applied.findIndex((l) => l.includes("PCC DNS local udp")) < g.applied.findIndex((l) => l.includes("per-connection-classifier")));
    // Sans hotspot : pas de hotspot=auth (le matcher ne matcherait rien, le PCC serait mort).
    const g2 = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT" }), sec({ ...base, IFACE: IF_UNIWAN }));
    assert.ok(g2.applied.filter((l) => l.includes("per-connection-classifier")).every((l) => !l.includes("hotspot=")));
  });

  it("migration FOUANGA : règles PCC déjà posées sans garde → set, DNS placé devant", () => {
    const old = sec({ ...base, IFACE: IF_UNIWAN, NAT: "0 D chain=hotspot action=jump jump-target=pre-hotspot",
      MANGLE: "0 comment=PCC 1/2 -> WAN1 chain=prerouting action=mark-connection new-connection-mark=WAN1 passthrough=yes dst-address-list=!slh-pcc-exclude connection-mark=no-mark in-interface=HOTSPOT per-connection-classifier=both-addresses-and-ports:2/0\n1 comment=PCC 2/2 -> WAN2 chain=prerouting action=mark-connection new-connection-mark=WAN2 passthrough=yes dst-address-list=!slh-pcc-exclude connection-mark=no-mark in-interface=HOTSPOT per-connection-classifier=both-addresses-and-ports:2/1\n2 chain=prerouting action=mark-routing new-routing-mark=to-WAN1 passthrough=yes connection-mark=WAN1\n3 chain=prerouting action=mark-routing new-routing-mark=to-WAN2 passthrough=yes connection-mark=WAN2" });
    const g = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT", wan1_mbps: 400, wan2_mbps: 400 }), old);
    assert.ok(g.applied.includes('/ip firewall mangle set [find comment="PCC 1/2 -> WAN1"] hotspot=auth'));
    assert.ok(g.applied.includes("/ip firewall mangle set [find action=mark-routing new-routing-mark=to-WAN2] in-interface=HOTSPOT"));
    assert.ok(g.applied.includes('/ip firewall mangle add chain=prerouting in-interface=HOTSPOT protocol=tcp dst-port=53 action=accept place-before=[find comment="PCC 1/2 -> WAN1"] comment="PCC DNS local tcp"'));
    assert.ok(!g.applied.some((l) => l.includes("per-connection-classifier")));
    // Rejouer sur le routeur réparé : plus rien à faire.
    const fixed = sec({ ...base, IFACE: IF_UNIWAN, NAT: "0 D chain=hotspot action=jump jump-target=pre-hotspot",
      MANGLE: "0 comment=PCC DNS local udp chain=prerouting action=accept protocol=udp in-interface=HOTSPOT dst-port=53\n1 comment=PCC DNS local tcp chain=prerouting action=accept protocol=tcp in-interface=HOTSPOT dst-port=53\n2 comment=PCC 1/2 -> WAN1 chain=prerouting action=mark-connection new-connection-mark=WAN1 hotspot=auth in-interface=HOTSPOT per-connection-classifier=both-addresses-and-ports:2/0\n3 comment=PCC 2/2 -> WAN2 chain=prerouting action=mark-connection new-connection-mark=WAN2 hotspot=auth in-interface=HOTSPOT per-connection-classifier=both-addresses-and-ports:2/1\n4 chain=prerouting action=mark-routing new-routing-mark=to-WAN1 passthrough=yes connection-mark=WAN1 in-interface=HOTSPOT\n5 chain=prerouting action=mark-routing new-routing-mark=to-WAN2 passthrough=yes connection-mark=WAN2 in-interface=HOTSPOT" });
    assert.ok(!runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT", wan1_mbps: 400, wan2_mbps: 400 }), fixed).applied.some((l) => l.includes("mangle")));
  });

  it("Bilan : les gardes PCC+hotspot sont un contrôle bloquant, et la vérification compte les TCP établies", () => {
    const hs = sec({ ...base, IFACE: IF_UNIWAN, NAT: "0 D chain=hotspot action=jump jump-target=pre-hotspot" });
    const g = runGenerate(req({ mode: "complement", lan_interface: "HOTSPOT", wan1_mbps: 400, wan2_mbps: 400 }), hs);
    assert.equal(g.plan.hotspot, true);
    const post = (mangle) => sec({ DHCP: "0 interface=E1-WAN-FAI status=bound address=192.168.1.2/24\n1 interface=E2-WAN-FAI status=bound address=100.64.0.2/10",
      ROUTE: Array.from({ length: 6 }, (_, i) => `${i} As comment=${["Main WAN1", "Main WAN2", "Marquee WAN1", "Backup WAN1", "Marquee WAN2", "Backup WAN2"][i]} dst-address=0.0.0.0/0`).join("\n"),
      MANGLE: mangle, NAT: "0 chain=srcnat action=masquerade out-interface=E1-WAN-FAI\n1 chain=srcnat action=masquerade out-interface=E2-WAN-FAI", CONN: "WAN1=10\nWAN2=8\nEST1=5\nEST2=4\nSYNRECV=1" });
    const bad = "0 comment=PCC 1/2 -> WAN1 chain=prerouting action=mark-connection per-connection-classifier=both-addresses-and-ports:2/0 in-interface=HOTSPOT\n1 comment=PCC 2/2 -> WAN2 chain=prerouting action=mark-connection per-connection-classifier=both-addresses-and-ports:2/1 in-interface=HOTSPOT\n2 chain=prerouting action=mark-routing new-routing-mark=to-WAN1 connection-mark=WAN1\n3 chain=prerouting action=mark-routing new-routing-mark=to-WAN2 connection-mark=WAN2";
    const good = "0 comment=PCC DNS local udp chain=prerouting action=accept protocol=udp in-interface=HOTSPOT dst-port=53\n1 comment=PCC DNS local tcp chain=prerouting action=accept protocol=tcp in-interface=HOTSPOT dst-port=53\n2 comment=PCC 1/2 -> WAN1 chain=prerouting action=mark-connection hotspot=auth per-connection-classifier=both-addresses-and-ports:2/0 in-interface=HOTSPOT\n3 comment=PCC 2/2 -> WAN2 chain=prerouting action=mark-connection hotspot=auth per-connection-classifier=both-addresses-and-ports:2/1 in-interface=HOTSPOT\n4 chain=prerouting action=mark-routing new-routing-mark=to-WAN1 connection-mark=WAN1 in-interface=HOTSPOT\n5 chain=prerouting action=mark-routing new-routing-mark=to-WAN2 connection-mark=WAN2 in-interface=HOTSPOT";
    const ko = runBilan(g, post(bad));
    assert.equal(ko.status, "error");
    assert.deepEqual(ko.details.failed, ["pcc_guards"]);
    assert.deepEqual(ko.details.guards, { mark_routing_lan: false, pcc_auth: false, dns_bypass: false });
    const ok = runBilan(g, post(good));
    assert.equal(ok.status, "ok");
    assert.deepEqual(ok.details.connections, { WAN1: 10, WAN2: 8, EST1: 5, EST2: 4, SYNRECV: 1 });
    assert.match(node("Vérification post-application").parameters.command, /EST1=.*tcp-state="established"/);
  });

  it("dry_run : la demande le porte, le générateur le propage, l'If d'application le respecte", () => {
    const r = req({ dry_run: true });
    assert.equal(r.dry_run, true);
    assert.equal(runGenerate(r, fresh).dry_run, true);
    assert.equal(node("Quelque chose à appliquer ?").parameters.conditions.conditions[0].leftValue, "={{ $json.to_apply > 0 && !$json.dry_run }}");
    assert.equal(wf.connections["Mode simulation ?"].main[0][0].node, "Pré-vérification");
    assert.equal(wf.connections["Mode simulation ?"].main[1][0].node, "Sauvegarde /export");
  });

  it("refus explicites : port encore dans le bridge, PCC étranger, demande invalide", () => {
    const inBridge = sec({ ...base, IFACE: IF_FRESH, BRIDGEPORT: "0 I interface=ether2 bridge=bridge" });
    assert.throws(() => runGenerate(req({}), inBridge), /encore un port du bridge.*detach_wan2_from_bridge/);
    assert.ok(runGenerate(req({ detach_wan2_from_bridge: true }), inBridge).applied.includes("/interface bridge port remove [find interface=ether2]"));
    const foreign = sec({ ...base, IFACE: IF_UNIWAN, MANGLE: "0 comment=PCC 1/2 -> WAN1 chain=prerouting per-connection-classifier=both-addresses-and-ports:2/0" });
    assert.throws(() => runGenerate(req({ cas: "cas1" }), foreign), /PCC étrangère/);
    assert.throws(() => runValidate({ router_id: "r1", cas: "cas9", mode: "complement" }), /router_host manquant.*cas invalide.*lan_interface requis/);
  });
});
