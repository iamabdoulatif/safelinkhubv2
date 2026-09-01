import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  analyserRsc,
  ecrireArgument,
  estRecetteMikhmon,
  lireArgument,
  planifierTransfert,
  recollerLignes,
  decouperArguments,
  rendreTransfert,
} from "./rsc-selective-restore";

const CIBLE = {
  poolName: "POOL-HOTSPOT",
  poolRanges: "10.5.50.10-10.5.53.254",
  hotspotServer: "hotspot1",
};

/** La vraie sauvegarde d'un RB951 en production (HSPT-KALAM, 7.24.1, mipsbe). */
const sauvegarde = () =>
  readFile(new URL("../../../test/fixtures/rb951-kalam.rsc", import.meta.url), "utf8");

describe("lecture d'un export RouterOS", () => {
  it("recolle les lignes coupées, y compris l'espace mangée", () => {
    /* RouterOS coupe à 78 colonnes avec « \ », et remplace parfois l'espace de
       coupure par « \_ » en tête de la ligne suivante. Un découpage naïf
       tronquerait un on-login au milieu — et le ticket n'expirerait plus, sans
       le moindre message. */
    const lignes = recollerLignes('add name=x \\\n    on-login=":put \\\n    \\_hello"');
    assert.equal(lignes.length, 1);
    assert.match(lignes[0], /:put\s+hello/);
  });

  it("rattache chaque commande à sa section", () => {
    const c = analyserRsc("/ip pool\nadd name=P ranges=1.1.1.1-1.1.1.9\n/ip dns\nset servers=8.8.8.8");
    assert.deepEqual(c.map((x) => [x.section, x.verbe]), [
      ["/ip pool", "add"],
      ["/ip dns", "set"],
    ]);
  });

  it("lit et réécrit un argument sans casser les guillemets", () => {
    const a = 'name=x comment="deux mots" profile=P';
    assert.equal(lireArgument(a, "comment"), "deux mots");
    assert.equal(lireArgument(a, "profile"), "P");
    assert.match(ecrireArgument(a, "profile", "Q"), /profile=Q/);
    // Un argument absent est AJOUTÉ, pas ignoré en silence.
    assert.match(ecrireArgument("name=x", "server", "hotspot1"), /server=hotspot1/);
  });
});

describe("ce que le transfert emporte, sur la vraie sauvegarde", () => {
  it("retient les profils, tickets, schedulers, pool et recettes", async () => {
    const plan = planifierTransfert(await sauvegarde(), CIBLE);
    const parSection = Object.fromEntries(plan.resume.map((r) => [r.section, r.retenues]));
    assert.equal(parSection["/ip hotspot user profile"], 5);
    assert.equal(parSection["/ip pool"], 1);
    assert.ok(parSection["/ip hotspot user"] >= 55, "tickets manquants");
    assert.ok(parSection["/system scheduler"] >= 5, "schedulers manquants");
    assert.ok(parSection["/system script"] >= 1, "historique de recettes manquant");
  });

  it("le compte `admin` de l'ancien routeur ne suit PAS", async () => {
    /* `add name=admin` sans profil est le compte du routeur d'origine. Le
       transférer écraserait celui du nouveau. */
    const out = rendreTransfert(planifierTransfert(await sauvegarde(), CIBLE));
    assert.ok(!/^add name=admin$/m.test(out));
  });
});

describe("ce que le transfert laisse derrière — le cœur du sujet", () => {
  it("aucune clé ni pair WireGuard", async () => {
    /* Le nouveau routeur a SON tunnel, ses clés et son adresse 10.66.0.x.
       Reposer ceux de l'ancien mettrait deux équipements à la même place dans
       le relais, et le parc perdrait les deux. */
    const out = rendreTransfert(planifierTransfert(await sauvegarde(), CIBLE));
    for (const interdit of ["wireguard", "LTCXBicJ", "10.66.0.48", "endpoint-address"]) {
      assert.ok(!out.includes(interdit), `fuite : ${interdit}`);
    }
  });

  it("aucun bridge, port, adresse ni pare-feu", async () => {
    // C'est la configuration réseau du routeur d'accueil, posée par
    // l'auto-setup. Elle ne doit pas bouger.
    const out = rendreTransfert(planifierTransfert(await sauvegarde(), CIBLE));
    for (const interdit of ["SAFELINKHUB-BRIDGE", "DOCKERS", "E1-WAN-FAI", "masquerade", "10.10.10.1"]) {
      assert.ok(!out.includes(interdit), `fuite : ${interdit}`);
    }
  });

  it("rien de propre à l'architecture mipsbe", async () => {
    /* Une sauvegarde de RB951 porte `/interface wireless`, menu que les cartes
       ARM n'ont pas : l'import échouerait au parse. */
    const out = rendreTransfert(planifierTransfert(await sauvegarde(), CIBLE));
    assert.ok(!out.includes("/interface wireless"));
    assert.ok(!out.includes("ssid="));
  });

  it("les sections écartées sont ANNONCÉES, pas jetées en silence", async () => {
    // L'exploitant doit pouvoir vérifier ce qui ne suivra pas.
    const plan = planifierTransfert(await sauvegarde(), CIBLE);
    assert.ok(plan.ecartees.length > 20, "trop peu de sections listées");
    assert.ok(plan.ecartees.includes("/ip firewall nat"));
    assert.ok(plan.ecartees.includes("/interface wireguard peers"));
  });
});

describe("adaptation au routeur d'accueil", () => {
  it("le pool est rebâti sur le sous-réseau du NOUVEAU routeur", async () => {
    /* Recopier 10.10.8.1-10.10.11.254 sur une carte adressée ailleurs
       distribuerait des baux hors sujet : le hotspot cesserait d'attribuer. */
    const out = rendreTransfert(planifierTransfert(await sauvegarde(), CIBLE));
    assert.match(out, /ranges=10\.5\.50\.10-10\.5\.53\.254/);
    assert.ok(!out.includes("10.10.8.1-10.10.11.254"));
  });

  it("chaque profil pointe le pool du nouveau routeur", async () => {
    const plan = planifierTransfert(await sauvegarde(), { ...CIBLE, poolName: "POOL-NEUF" });
    const profils = plan.commandes.filter((c) => c.section === "/ip hotspot user profile");
    assert.ok(profils.length > 0);
    for (const p of profils) assert.equal(lireArgument(p.arguments, "address-pool"), "POOL-NEUF");
  });

  it("chaque ticket pointe le serveur du nouveau routeur", async () => {
    const plan = planifierTransfert(await sauvegarde(), { ...CIBLE, hotspotServer: "hs-neuf" });
    const tickets = plan.commandes.filter((c) => c.section === "/ip hotspot user");
    assert.ok(tickets.length > 0);
    for (const t of tickets) assert.equal(lireArgument(t.arguments, "server"), "hs-neuf");
  });
});

describe("expiration, rapports et revenus", () => {
  it("le `on-login` des profils part VERBATIM", async () => {
    /* C'est lui qui écrit la date d'expiration dans le commentaire du ticket
       ET la ligne que MikHmon compte en recette. Le réécrire, même « pour
       l'améliorer », casserait l'un ou l'autre. */
    const out = rendreTransfert(planifierTransfert(await sauvegarde(), CIBLE));
    assert.ok(out.includes(':put (\\",remc,100,5h,100,'), "ligne de recette 05-HEURES perdue");
    assert.ok(out.includes(':put (\\",remc,3000,30d,3000,'), "ligne de recette 01-MOIS perdue");
    // La logique d'expiration écrit un scheduler par ticket : elle doit suivre.
    assert.match(out, /\/sys sch add name=/);
  });

  it("le commentaire de CHAQUE ticket part intact, dans ses deux formes", async () => {
    /* MESURÉ sur la sauvegarde, pas supposé : les tickets portent DEUX formes
       de commentaire, et les deux comptent.
         « sep/01/2026 17:43:03 » — la date d'expiration, écrite à la première
                                    connexion ;
         « vc-405-09.01.26 »      — un ticket encore INUTILISÉ.
       Le on-login le dit lui-même : `:if ($ucode = "vc" or $ucode = "up" or
       $comment = "")` — c'est ce marqueur qui déclenche la pose de la date.
       Ma première version de ce test n'attendait que la date et échouait sur
       les vouchers neufs ; le code, lui, était juste.

       Sans ces commentaires, le balayage ne sait pas quand supprimer et les
       tickets n'expirent jamais — la panne déjà vue sur HSPT-TREW. */
    const plan = planifierTransfert(await sauvegarde(), CIBLE);
    const tickets = plan.commandes.filter((c) => c.section === "/ip hotspot user");
    const commentaires = tickets.map((t) => lireArgument(t.arguments, "comment") ?? "");

    assert.equal(commentaires.filter(Boolean).length, tickets.length, "un ticket a perdu son commentaire");
    const dates = commentaires.filter((c) => /^\w{3}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(c));
    const neufs = commentaires.filter((c) => /^(vc|up)-/.test(c));
    assert.ok(dates.length > 0, "aucune date d'expiration");
    assert.ok(neufs.length > 0, "aucun voucher inutilisé");
    assert.equal(dates.length + neufs.length, tickets.length, "une forme inattendue est apparue");
  });

  it("l'historique de recettes suit, mais PAS les autres scripts", async () => {
    /* MikHmon range chaque vente dans /system script sous `comment=mikhmon`.
       Sans elles, le revenu journalier et mensuel repart de zéro. Le script
       `export-all` de SafeLinkHub, lui, porte un propriétaire et des droits qui
       n'ont aucun sens sur le nouvel équipement. */
    assert.equal(estRecetteMikhmon('comment=mikhmon name="sep/01/2026-|-…"'), true);
    assert.equal(estRecetteMikhmon("name=export-all owner=safelinkhub-api"), false);

    const out = rendreTransfert(planifierTransfert(await sauvegarde(), CIBLE));
    assert.ok(!out.includes("name=export-all"), "export-all transféré à tort");
    assert.match(out, /-\|-100-\|-/, "le prix d'une vente ne suit pas");
  });
});

describe("découpage vers l'API RouterOS", () => {
  it("un `on-login` avec espaces reste UN seul argument", () => {
    /* L'API prend un mot par argument. Un découpage sur les espaces ferait
       arriver le profil avec un script tronqué — qui n'expire plus rien, sans
       la moindre erreur. Vérifié sur le comportement, pas sur le texte du
       code : ma première version inspectait la source et se cassait sur son
       propre commentaire. */
    const mots = decouperArguments('name=05-HEURES on-login=":put (\\",remc,100,5h\\"); :local x 1" shared-users=1');
    assert.equal(mots.length, 3);
    assert.equal(mots[0], "=name=05-HEURES");
    assert.match(mots[1], /^=on-login=:put .*:local x 1$/);
    assert.equal(mots[2], "=shared-users=1");
  });

  it("le vrai on-login de la sauvegarde traverse d'un bloc", async () => {
    const plan = planifierTransfert(await sauvegarde(), CIBLE);
    const profil = plan.commandes.find((c) => c.section === "/ip hotspot user profile");
    const mots = decouperArguments(profil!.arguments);
    const onLogin = mots.find((m) => m.startsWith("=on-login="));
    assert.ok(onLogin, "on-login perdu au découpage");
    // La ligne de recette ET la pose du scheduler doivent être dans LE MÊME mot.
    assert.match(onLogin!, /remc,100,5h/);
    assert.match(onLogin!, /sys sch add/);
  });

  it("les guillemets échappés sont rendus à RouterOS", () => {
    // `\"` dans l'export est un guillemet littéral une fois transmis.
    const [mot] = decouperArguments('comment="il a dit \\"oui\\""');
    assert.equal(mot, '=comment=il a dit "oui"');
  });
});
