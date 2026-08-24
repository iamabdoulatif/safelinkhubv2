import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildSweepScript,
  handlesIsoClock,
  inspectSweepSchedulers,
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
  });

  it("ignore un planificateur sans identifiant — on ne peut pas l'écrire", () => {
    const r = inspectSweepSchedulers([{ name: "JOUR", "on-event": BALAYAGE_PERIME }]);
    assert.equal(r.total, 1);
    assert.equal(r.stale.length, 0);
  });
});

describe("le correctif est branché, et conserve le planificateur", () => {
  it("modifie le on-event au lieu de recréer la ligne", async () => {
    /* Recréer ferait perdre l'intervalle, le propriétaire et la POLITIQUE :
       relevé sur le parc, ces planificateurs appartiennent à `admin` avec
       policy write+policy. Recréés par le compte API, ils hériteraient d'une
       politique plus étroite et pourraient ne plus avoir le droit de
       supprimer un utilisateur. */
    const src = await readFile(new URL("./router-audit-fixes.ts", import.meta.url), "utf8");
    const bloc = src.slice(src.indexOf("export async function repairExpirySweeps"));
    assert.match(bloc, /\/system\/scheduler\/set/);
    assert.doesNotMatch(bloc, /\/system\/scheduler\/add/);
    assert.doesNotMatch(bloc, /\/system\/scheduler\/remove/);
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
