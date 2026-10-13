import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyMikhmonDate, legacySaleRecord, overwritesSaleOwner } from "./mikhmon-sales";
import { patchOnLoginForIsoClock } from "./expiry-sweep-script";

test("date ISO → format MikHmon", () => {
  assert.equal(legacyMikhmonDate("2026-10-13"), "oct/13/2026");
  assert.equal(legacyMikhmonDate("oct/13/2026"), "oct/13/2026");
  assert.equal(legacyMikhmonDate("2026-13-01"), null);
});

test("vente ISO (MikHmon d'origine sur RouterOS ≥ 7.10) remise au format des rapports", () => {
  // owner « 202-13 » = $month$year découpés aux positions de l'ancien format.
  const row = { name: "2026-10-13-|-08:15:02-|-ab12-|-500-|-10.5.50.9-|-AA:BB-|-1d-|-JOUR-|-vc-x", owner: "202-13", source: "2026-10-13" };
  assert.deepEqual(legacySaleRecord(row), { name: "oct/13/2026-|-08:15:02-|-ab12-|-500-|-10.5.50.9-|-AA:BB-|-1d-|-JOUR-|-vc-x", owner: "oct2026", source: "oct/13/2026" });
});

test("vente déjà lisible ou script étranger : intouché", () => {
  assert.equal(legacySaleRecord({ name: "oct/13/2026-|-08:15:02-|-ab12-|-500", owner: "oct2026", source: "oct/13/2026" }), null);
  assert.equal(legacySaleRecord({ name: "mon-script", owner: "admin", source: ":log info x" }), null);
});

test("on-login du MikHmon d'origine (laksa19) : reconnu et corrigé", () => {
  const laksa = ':put (",rem,500,1d,500,,Disable,"); {:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment]; :local ucode [:pic $comment 0 2]; :if ($ucode = "vc" or $ucode = "up" or $comment = "") do={ :local date [ /system clock get date ];:local year [ :pick $date 7 11 ];:local month [ :pick $date 0 3 ]; /sys sch add name="$user" disable=no start-date=$date interval="1d"; :delay 5s; :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];:local getxp [len $exp]; :if ($getxp = 15) do={ :local d [:pic $exp 0 6]; :local t [:pic $exp 7 16]; :local s ("/"); :local exp ("$d$s$year $t"); /ip hotspot user set comment=$exp [find where name="$user"];}; :if ($getxp = 8) do={ /ip hotspot user set comment="$date $exp" [find where name="$user"];}; :if ($getxp > 15) do={ /ip hotspot user set comment=$exp [find where name="$user"];}; /sys sch remove [find where name="$user"]; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-500-|-$address-|-$mac-|-1d-|-JOUR-|-$comment" owner="$month$year" source=$date comment=mikhmon}}';
  const patched = patchOnLoginForIsoClock(laksa);
  assert.ok(patched && patched.includes("arraybln"));
  assert.equal(patchOnLoginForIsoClock(patched!), null);
});

test("RouterOS 7.24 : owner écrasé en *sys → remis au mois de la vente", () => {
  const row = { name: "sep/09/2026-|-09:49:41-|-1h9533-|-100-|-10.255.255.29-|-BA:D7-|-1h-|-01-HEURE-|-vc-356", owner: "*sys", source: "sep/09/2026" };
  assert.deepEqual(legacySaleRecord(row), { name: row.name, owner: "sep2026", source: "sep/09/2026" });
  assert.equal(overwritesSaleOwner("7.24.2 (stable)"), true);
  assert.equal(overwritesSaleOwner("7.23.1 (stable)"), false);
});
