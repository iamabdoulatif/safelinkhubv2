import test from "node:test";
import assert from "node:assert/strict";
import {
  VPN_TRIAL_DAYS,
  LEGACY_VPN_TRIAL_DAYS,
  VPN_TRIAL_30D_SINCE,
  vpnTrialDaysFor,
  vpnTrialEndsAt,
  isWithinVpnTrial,
  vpnTrialDaysRemaining,
} from "../src/lib/billing/auto-setup-pricing.ts";
import { shouldChargeVpnActivation, computeVpnQuotaGrant } from "../src/lib/billing/vpn-quota.ts";

const avant = new Date("2026-08-05T00:00:00.000Z"); // 16 jours avant la bascule
const apres = new Date("2026-08-25T00:00:00.000Z");

test("l'offre courante est de 30 jours, l'ancienne reste à 10", () => {
  assert.equal(VPN_TRIAL_DAYS, 30);
  assert.equal(LEGACY_VPN_TRIAL_DAYS, 10);
  assert.equal(vpnTrialDaysFor(apres), 30);
  assert.equal(vpnTrialDaysFor(avant), 10);
  // La borne appartient à la nouvelle offre.
  assert.equal(vpnTrialDaysFor(VPN_TRIAL_30D_SINCE), 30);
});

test("le passage à 30 jours n'est PAS rétroactif", () => {
  // Le cœur de la demande : « pour les nouveaux utilisateurs ». Mesuré au
  // moment du changement, 17 organisations avaient entre 10 et 30 jours. Si la
  // durée courante s'appliquait à tout le monde, elles auraient récupéré
  // l'accès distant gratuit sans rien demander.
  const org = new Date("2026-08-05T00:00:00.000Z"); // avant la bascule
  const j15 = new Date("2026-08-20T00:00:00.000Z"); // 15 jours plus tard

  assert.equal(isWithinVpnTrial(org, j15), false, "son essai de 10 jours est fini");
  assert.equal(
    shouldChargeVpnActivation({
      isSuperAdmin: false,
      orgCreatedAt: org,
      vpnQuotaMode: "default",
      vpnQuotaExpiresAt: null,
      now: j15,
    }),
    true,
    "elle doit rester facturée",
  );
});

test("un compte créé après la bascule a bien 30 jours", () => {
  const j15 = new Date("2026-09-09T00:00:00.000Z"); // 15 jours après création
  assert.equal(isWithinVpnTrial(apres, j15), true);
  assert.equal(vpnTrialDaysRemaining(apres, j15), 15);
  assert.equal(
    shouldChargeVpnActivation({
      isSuperAdmin: false,
      orgCreatedAt: apres,
      vpnQuotaMode: "default",
      vpnQuotaExpiresAt: null,
      now: j15,
    }),
    false,
    "pas de débit pendant l'essai",
  );

  // Et au 31e jour, l'essai est fini.
  const j31 = new Date("2026-09-25T00:00:00.000Z");
  assert.equal(isWithinVpnTrial(apres, j31), false);
  assert.equal(vpnTrialEndsAt(apres).toISOString().slice(0, 10), "2026-09-24");
});

test("l'inscription accorde 30 jours, pas 10", async () => {
  const { readFile } = await import("node:fs/promises");
  const actions = await readFile(new URL("../src/lib/auth/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /computeVpnQuotaGrant\("free_30_days"\)/);
  assert.doesNotMatch(actions, /computeVpnQuotaGrant\("free_10_days"\)/);

  // Le quota posé couvre bien 30 jours pleins.
  const now = new Date("2026-08-25T00:00:00.000Z");
  const { expiresAt, mode } = computeVpnQuotaGrant("free_30_days", now);
  assert.equal(mode, "free_until");
  assert.equal(expiresAt.toISOString(), "2026-09-24T00:00:00.000Z");
});

test("la landing annonce la durée depuis la constante", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
  for (const f of [
    "src/components/landing/Hero.tsx",
    "src/components/landing/AnnounceBar.tsx",
    "src/components/landing/ProductDemo.tsx",
    "src/components/landing/Pricing.tsx",
  ]) {
    const src = await read(f);
    assert.match(src, /VPN_TRIAL_DAYS/, `${f} doit lire la constante`);
    // Aucune durée recopiée : la page ne peut pas annoncer autre chose que ce
    // que le compte reçoit réellement.
    assert.doesNotMatch(src, /\b(10|30) jours d/, `${f} ne doit pas coder la durée en dur`);
  }
});

test("chaque organisation lit SA durée, pas l'offre courante", async () => {
  // Sans cela, /admin/remote-access aurait annoncé « 30 premiers jours offerts »
  // à des comptes qui n'en ont reçu que 10.
  const { readFile } = await import("node:fs/promises");
  const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

  const actions = await read("src/lib/billing/actions.ts");
  assert.match(actions, /totalDays: vpnTrialDaysFor\(org\.createdAt\)/);
  assert.equal((actions.match(/totalDays: vpnTrialDaysFor/g) ?? []).length, 2,
    "les deux branches du statut doivent la porter");

  const section = await read("src/app/admin/remote-access/DirectAccessSection.tsx");
  assert.match(section, /vpnTrial\.totalDays \?\? VPN_TRIAL_DAYS/);
  assert.match(section, /vpnTrial\?\.totalDays \?\? VPN_TRIAL_DAYS/);
});
