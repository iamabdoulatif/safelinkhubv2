import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const REWARDS = "src/lib/referrals/rewards.ts";
const SERVICE = "src/lib/referrals/service.ts";
const AUTH_ACTIONS = "src/lib/auth/actions.ts";
const CONTAINER_SETUP = "src/lib/mikrotik/container-setup.ts";
const RA_SERVICE = "src/lib/billing/remote-access-authorization-service.ts";
const RA_ACTIONS = "src/lib/billing/remote-access-authorization-actions.ts";
const MIGRATION = "scripts/add-referrals.sql";
const CARD = "src/app/admin/billing/ReferralCard.tsx";

test("le barème est celui annoncé : 5 / 10 / 8 Safecoins", async () => {
  const source = await read(REWARDS);

  assert.match(source, /signup:\s*5,/);
  assert.match(source, /auto_setup:\s*10,/);
  assert.match(source, /vpn_yearly:\s*8,/);
  // Le grand livre compte en sous-unités : 5 SC = 500, pas 5.
  assert.match(source, /REFERRAL_REWARD_SC\[event\] \* SC_SCALE/);
});

test("le barème vit dans un module PUR, séparé de la base", async () => {
  const rewards = await read(REWARDS);
  const card = await read(CARD);

  // rewards.ts ne doit tirer NI drizzle NI getDb : il est importé par un
  // composant client, et `pg` dans un bundle client casse le build Next.
  assert.doesNotMatch(rewards, /from "drizzle-orm"/);
  assert.doesNotMatch(rewards, /@\/lib\/db/);
  // La carte importe donc rewards.ts, jamais service.ts.
  assert.match(card, /from "@\/lib\/referrals\/rewards"/);
  assert.doesNotMatch(card, /from "@\/lib\/referrals\/service"/);
});

test("chaque étape n'est primée qu'une fois, à deux niveaux", async () => {
  const [service, migration] = await Promise.all([read(SERVICE), read(MIGRATION)]);

  // 1) Verrou base : une seule ligne possible par (filleul, étape).
  assert.match(migration, /create unique index if not exists referral_rewards_referred_event_key/);
  assert.match(service, /onConflictDoNothing\(\{[\s\S]{0,120}referredOrgId, referralRewards\.event/);
  // La réservation précède le crédit : deux appels concurrents, un seul crédite.
  // (On repart du corps de awardReferral, pas du fichier : la ligne d'import
  // de appendSafecoinCredit est en tête et fausserait la comparaison.)
  const body = service.slice(service.indexOf("export async function awardReferral"));
  const reserveAt = body.indexOf("insert(referralRewards)");
  const creditAt = body.indexOf("await appendSafecoinCredit(");
  assert.ok(reserveAt !== -1 && creditAt !== -1);
  assert.ok(reserveAt < creditAt, "l'étape doit être réservée AVANT le crédit");

  // 2) Verrou comptable : clé d'idempotence du grand livre.
  assert.match(service, /idempotencyKey: `referral:\$\{event\}:\$\{referredOrgId\}`/);
});

test("le parrainage ne peut jamais faire échouer le parcours qu'il observe", async () => {
  const service = await read(SERVICE);

  // awardReferral avale toute erreur et la rend par sa valeur de retour :
  // une prime ratée ne doit pas transformer un auto-setup réussi en échec,
  // ni bloquer une activation de compte.
  assert.match(service, /export async function awardReferral[\s\S]{0,4000}\} catch \(err\) \{/);
  assert.match(service, /return \{ awarded: false, reason: err instanceof Error/);
});

test("on ne peut pas se parrainer soi-même", async () => {
  const service = await read(SERVICE);
  assert.match(service, /if \(referrer\.id === referredOrgId\) return;/);
});

test("la prime d'inscription attend l'ACTIVATION du compte", async () => {
  const source = await read(AUTH_ACTIONS);

  // Le rattachement se fait à l'inscription…
  assert.match(source, /attachReferrer\(org\.id, referralCode\)/);
  // …mais le crédit seulement une fois l'email confirmé, sinon une adresse
  // jetable jamais activée rapporterait 5 SC.
  const activateAt = source.indexOf("export async function activateAccount");
  const awardAt = source.indexOf('awardReferral(user.orgId, "signup")');
  assert.ok(awardAt !== -1, "l'activation doit verser la prime signup");
  assert.ok(awardAt > activateAt, "la prime signup appartient à activateAccount");
});

test("les trois étapes sont branchées sur de vrais événements", async () => {
  const [containerSetup, raService, raActions, service] = await Promise.all([
    read(CONTAINER_SETUP),
    read(RA_SERVICE),
    read(RA_ACTIONS),
    read(SERVICE),
  ]);

  // Auto-setup : primé sur le chemin de SUCCÈS, après la facturation.
  assert.match(containerSetup, /awardReferral\(org\.id, "auto_setup"\)/);
  const awardAt = containerSetup.indexOf('awardReferral(org.id, "auto_setup")');
  const successAt = containerSetup.lastIndexOf("success: true,");
  assert.ok(awardAt !== -1 && successAt !== -1 && awardAt < successAt);

  // VPN 1 an : les TROIS chemins d'approbation sont couverts — webhook
  // GeniusPay, validation manuelle par l'admin, et paiement depuis le solde
  // (qui crée l'autorisation déjà approuvée, sans passer par les deux autres).
  const hooks = (raService.match(/awardVpnYearlyReferral\(/g) ?? []).length;
  assert.equal(hooks, 2, "webhook + décision admin");
  assert.match(raActions, /awardVpnYearlyReferral\(session\.orgId, billingPeriod\)/);

  // Le filtre de durée est DANS le helper, pas chez les appelants : aucun des
  // trois ne peut se tromper de règle.
  assert.match(service, /if \(billingPeriod !== "yearly"\) return \{ awarded: false/);
});

test("le lien d'invitation est porté par l'inscription", async () => {
  const [page, form] = await Promise.all([
    read("src/app/auth/register/page.tsx"),
    read("src/app/auth/register/RegisterForm.tsx"),
  ]);

  assert.match(page, /searchParams/);
  assert.match(page, /findOrgByReferralCode/);
  // Champ caché : une erreur de validation re-rend le formulaire sans la query
  // string — sans ce champ, le parrainage serait perdu au 2ᵉ essai.
  assert.match(form, /type="hidden" name="referralCode"/);
});
