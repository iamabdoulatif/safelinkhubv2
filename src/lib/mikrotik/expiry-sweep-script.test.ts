import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildSweepScript,
  handlesIsoClock,
  inspectProfileOnLogin,
  inspectSweepSchedulers,
  onLoginHandlesIsoClock,
  patchOnLoginForIsoClock,
  sweptProfile,
} from "./expiry-sweep-script";
import { VOUCHER_PROFILES } from "./voucher-profiles";

/* Le script réellement relevé sur HTSPT-TREW le 2026-08-24 : il calcule
   `$today` SANS convertir l'horloge ISO de RouterOS 7.24. Neuf planificateurs
   comme celui-ci tournaient toutes les 2 min 30 sans rien supprimer. */
const BALAYAGE_PERIME =
  ':local dateint do={:local montharray ( "jan","feb","mar" );:local days [ :pick $d 4 6 ];};' +
  ' :local date [ /system clock get date ]; :local time [ /system clock get time ];' +
  ' :local today [$dateint d=$date] ;' +
  ' :foreach i in [ /ip hotspot user find where profile="JOUR" ] do={ /ip hotspot user remove $i }';

describe("reconnaissance d'un balayage", () => {
  it("identifie le profil visé, y compris un profil personnalisé", () => {
    assert.equal(sweptProfile(BALAYAGE_PERIME), "JOUR");
    assert.equal(
      sweptProfile('… /ip hotspot user find where profile="Ordinateur-" …'),
      "Ordinateur-",
    );
    // Un planificateur qui n'est pas un balayage ne doit pas être touché.
    assert.equal(sweptProfile("/system reboot"), null);
    assert.equal(sweptProfile(""), null);
  });

  it("distingue un balayage aveugle d'un balayage à jour", () => {
    assert.equal(handlesIsoClock(BALAYAGE_PERIME), false);
    assert.equal(handlesIsoClock(buildSweepScript("JOUR")), true);
  });

  it("la conversion doit porter sur $date, pas seulement sur $exp", () => {
    /* C'est `$date` — le jour courant — qui décide de la comparaison. Un
       script qui convertit `$exp` mais pas `$date` reste aveugle : c'est
       exactement le piège des scripts MikHmon d'origine. */
    const seulementExp =
      BALAYAGE_PERIME + ' :if ([:pick $exp 4 5] = "-") do={ :set $exp "converti" };';
    assert.equal(handlesIsoClock(seulementExp), false);
  });
});

describe("construction du script de remplacement", () => {
  it("reprend le texte du catalogue et ne change QUE le profil visé", () => {
    /* Pas de réécriture maison : le texte est celui déjà en service sur le
       parc sain, donc il n'y a rien de neuf à valider. */
    const modele = VOUCHER_PROFILES.find((p) => p.name === "01-JOUR")!.monitorOnEvent;
    const genere = buildSweepScript("5-jour");
    assert.equal(sweptProfile(genere), "5-jour");
    assert.equal(handlesIsoClock(genere), true);
    assert.equal(
      genere.replace('profile="5-jour"', 'profile="01-JOUR"'),
      modele,
      "seule la cible doit différer du modèle",
    );
  });

  it("le modèle du catalogue gère bien l'horloge ISO", () => {
    // Sinon le correctif propagerait la panne au lieu de la réparer.
    for (const p of VOUCHER_PROFILES) {
      if (!p.monitorOnEvent || p.unlimited) continue;
      assert.equal(handlesIsoClock(p.monitorOnEvent), true, `profil ${p.name}`);
    }
  });
});

describe("inspection des planificateurs", () => {
  it("ne retient que les balayages aveugles", () => {
    const r = inspectSweepSchedulers([
      { ".id": "*1", name: "JOUR", "on-event": BALAYAGE_PERIME },
      { ".id": "*2", name: "MOIS", "on-event": buildSweepScript("MOIS") },
      { ".id": "*3", name: "MIKHMON_BOOT", "on-event": "/container start [find]" },
      { ".id": "*4", name: "vide" },
    ]);
    assert.equal(r.total, 2, "deux balayages, le reste n'en est pas");
    assert.deepEqual(r.stale.map((s) => s.profile), ["JOUR"]);
    assert.equal(sweptProfile(r.stale[0].script), "JOUR", "le remplacement vise le même profil");
    assert.equal(r.stale[0].interval, "2m30s", "intervalle par défaut si absent");
  });

  it("ignore un planificateur sans identifiant — on ne peut pas l'écrire", () => {
    const r = inspectSweepSchedulers([{ name: "JOUR", "on-event": BALAYAGE_PERIME }]);
    assert.equal(r.total, 1);
    assert.equal(r.stale.length, 0);
  });
});

describe("le correctif est branché, et conserve le planificateur", () => {
  it("recrée le planificateur — le modifier est REFUSÉ par RouterOS", async () => {
    /* Mesuré sur HTSPT-TREW : un `/system/scheduler/set` sur les huit lignes a
       été refusé — « user's policy does not allow to edit this script ». Elles
       appartiennent à `admin` et portent reboot/password/sniff/romon ; éditer
       un script exige de posséder toutes ses politiques, et le compte API ne
       doit surtout pas les avoir.
       Supprimer puis recréer est autorisé : la nouvelle ligne hérite de la
       politique du compte API, dont le `write` suffit au balayage. */
    const src = await readFile(new URL("./router-audit-fixes.ts", import.meta.url), "utf8");
    const bloc = src.slice(src.indexOf("export async function repairExpirySweeps"));
    assert.match(bloc, /\/system\/scheduler\/remove/);
    assert.match(bloc, /\/system\/scheduler\/add/);
    assert.doesNotMatch(bloc, /\/system\/scheduler\/set/);
    // Nom et intervalle d'origine repris : les intervalles du parc sont
    // décalés exprès pour ne pas déclencher huit balayages à la même seconde.
    assert.match(bloc, /=name=\$\{s\.name\}/);
    assert.match(bloc, /=interval=\$\{s\.interval\}/);
  });

  it("l'audit lève un constat corrigeable", async () => {
    const src = await readFile(new URL("./router-audit.ts", import.meta.url), "utf8");
    assert.match(src, /"expiry-sweep-stale"/);
    assert.match(src, /"expiry-sweep",?\s*\n?\s*\);/);
  });

  it("le balayage est réparé AVANT les dates, sur la flotte", async () => {
    /* Réécrire des dates que personne ne lit ne supprimerait toujours rien :
       l'ordre porte le sens du correctif. */
    const src = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
    const bloc = src.slice(
      src.indexOf("export async function fixAllRoutersTicketExpiryFormat"),
      src.indexOf("export async function fixRouterExpirySweep"),
    );
    assert.ok(
      bloc.indexOf("repairExpirySweeps(client)") < bloc.indexOf("rewriteIsoExpiryComments(client)"),
      "le balayage doit être remis en service en premier",
    );
  });
});

describe("l'intervalle d'origine est conservé", () => {
  it("reprend celui du planificateur remplacé", () => {
    const r = inspectSweepSchedulers([
      { ".id": "*9", name: "10-jour", interval: "2m12s", "on-event": BALAYAGE_PERIME.replace('profile="JOUR"', 'profile="10-jour"') },
    ]);
    assert.equal(r.stale[0].interval, "2m12s");
  });
});

/* Le `on-login` réellement relevé sur le profil JOUR de HTSPT-TREW. C'est lui
   qui écrivait « 2026-08-25 02:15:40 » : `next-run` fait 19 caractères sur
   RouterOS 7.24, donc « > 15 », donc recopié tel quel. */
const ONLOGIN_PERIME =
  ':put (",remc,200,1d,0,,Disable,"); {:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment];' +
  ' :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $comment = "") do={' +
  ' :local date [ /system clock get date ];:local year [ :pick $date 7 11 ];' +
  ' /sys sch add name="$user" disable=no start-date=$date interval="1d"; :delay 5s;' +
  ' :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];' +
  ' :local getxp [len $exp]; :if ($getxp > 15) do={ /ip hotspot user set comment="$exp" [find where name="$user"];};}}';

describe("le script de connexion, source des dates illisibles", () => {
  it("reconnaît un on-login aveugle", () => {
    assert.equal(onLoginHandlesIsoClock(ONLOGIN_PERIME), false);
  });

  it("insère les DEUX conversions, sans toucher au reste", () => {
    /* Le script porte la durée, le prix et le nom du profil : on ne l'échange
       pas, on le complète. Pour « 5-jour » ou « Ordinateur- », on ne saurait
       de toute façon pas reconstituer ces valeurs. */
    const patche = patchOnLoginForIsoClock(ONLOGIN_PERIME)!;
    assert.ok(patche, "un correctif doit être proposé");
    assert.equal(onLoginHandlesIsoClock(patche), true);
    assert.match(patche, /:pick \$exp 10 11/, "la conversion de \$exp aussi");
    // Ce qui identifie le profil est intact.
    assert.match(patche, /interval="1d"/);
    assert.match(patche, /",remc,200,1d,0,,Disable,"/);
    // Et l'ordre du script n'est pas cassé.
    assert.ok(patche.indexOf(":local date") < patche.indexOf(":local year"));
    assert.ok(patche.indexOf("next-run]") < patche.indexOf(":local getxp"));
  });

  it("est idempotent — un script déjà complété n'est plus touché", () => {
    const patche = patchOnLoginForIsoClock(ONLOGIN_PERIME)!;
    assert.equal(patchOnLoginForIsoClock(patche), null);
  });

  it("refuse un script dont il ne reconnaît pas les repères", () => {
    assert.equal(patchOnLoginForIsoClock(":log info bonjour"), null);
    assert.equal(patchOnLoginForIsoClock(""), null);
  });

  it("l'inspection ne retient que les profils à compléter", () => {
    const r = inspectProfileOnLogin([
      { ".id": "*1", name: "JOUR", "on-login": ONLOGIN_PERIME },
      { ".id": "*2", name: "MOIS", "on-login": patchOnLoginForIsoClock(ONLOGIN_PERIME)! },
      { ".id": "*3", name: "default" },
    ]);
    assert.equal(r.total, 2, "le profil sans on-login n'en est pas un");
    assert.deepEqual(r.stale.map((s) => s.name), ["JOUR"]);
  });
});

describe("les deux moitiés partent ensemble", () => {
  it("le correctif répare le balayage ET le script de connexion", async () => {
    /* Réparer le balayage seul, c'est vider une baignoire robinet ouvert :
       chaque nouvelle connexion refabriquerait un ticket illisible. */
    const src = await readFile(new URL("./router-audit-fixes.ts", import.meta.url), "utf8");
    const bloc = src.slice(src.indexOf("export async function repairExpirySweeps"));
    assert.match(bloc, /inspectProfileOnLogin\(/);
    assert.match(bloc, /\/ip\/hotspot\/user\/profile\/set/);
  });
});

describe("ne jamais convertir deux fois l'horloge ISO", () => {
  /* Le script MikHmon récent : il convertit l'ISO à SA manière, en cherchant
     un tiret. C'est cette forme que le contrôle ne voyait pas. */
  const MIKHMON_RECENT =
    ':local date [ /system clock get date ];:local year [ :pick $date 7 11 ];' +
    ':if ([:find $date "-"] != nil) do={ :set dateKey "x"; };' +
    '/sys sch add name="$user" start-date=$date interval="2d";' +
    ':local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];' +
    ':if ([:find $exp "-"] != nil) do={ :set expKey "y"; };';

  it("reconnaît la conversion de MikHmon, pas seulement la nôtre", () => {
    assert.equal(onLoginHandlesIsoClock(MIKHMON_RECENT), true);
  });

  it("n'insère RIEN dans un script qui gère déjà l'ISO", () => {
    // C'est le défaut qui a rendu 202 tickets éternels sur HSPT-FOUANGA :
    // deux conversions superposées produisent une année « sep/ ».
    assert.equal(patchOnLoginForIsoClock(MIKHMON_RECENT), null);
  });

  it("complète toujours un script qui, lui, ignore l'ISO", () => {
    assert.notEqual(patchOnLoginForIsoClock(ONLOGIN_PERIME), null);
  });
});
