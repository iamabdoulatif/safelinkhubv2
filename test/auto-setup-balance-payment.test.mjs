import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

const AUTO_SETUP_ACTIONS = "src/lib/billing/auto-setup-authorization-actions.ts";
const REMOTE_ACCESS_ACTIONS = "src/lib/billing/remote-access-authorization-actions.ts";
const CONTAINER_SETUP = "src/lib/mikrotik/container-setup.ts";
const PAYWALL_MODAL = "src/app/admin/settings/router-setup/AutoSetupPaywallModal.tsx";

test("l'auto-setup se paie depuis le solde, comme l'accès distant", async () => {
  const source = await read(AUTO_SETUP_ACTIONS);

  // Les deux actions que le modal appelle : soldes affichés, puis débit.
  assert.match(source, /export async function getAutoSetupBalancesPublic/);
  assert.match(source, /export async function payAutoSetupFromBalance/);
  // Autorisation créée DÉJÀ APPROUVÉE : pas de webhook à attendre, pas d'admin
  // à solliciter — c'est ce qui débloque la porte au clic suivant.
  assert.match(source, /createApprovedAutoSetupAuthorization/);
  // Le portefeuille est débité par une écriture, les Safecoins par le débit
  // idempotent partagé avec le prélèvement d'exécution.
  assert.match(source, /walletTransactions\)\.values\(/);
  assert.match(source, /chargeAutoSetup\(/);
  // Filet : si le débit Safecoin échoue après coup, l'autorisation est annulée
  // — sinon l'org obtiendrait un auto-setup gratuit.
  assert.match(source, /markAutoSetupAuthorizationRejected/);
  // Pas de second débit du portefeuille si c'est déjà payé (le débit Safecoin,
  // lui, est protégé par sa clé d'idempotence).
  assert.match(source, /findUsableAuthorization/);
  // Tarif imposé côté serveur : le client n'envoie que le routeur et sa
  // capacité container, jamais un montant.
  assert.match(source, /autoSetupPriceFcfa\(getAutoSetupGateConfig\(\), supportsContainers\)/);
});

test("le paywall auto-setup propose les trois moyens de paiement", async () => {
  const modal = await read(PAYWALL_MODAL);

  assert.match(modal, /startAutoSetupPayment/); // mobile money (GeniusPay)
  assert.match(modal, /payAutoSetupFromBalance/); // portefeuille ou Safecoins
  assert.match(modal, /submitAutoSetupAuthorizationRequest/); // preuve manuelle
  // Les deux soldes sont affichés pour que l'utilisateur sache ce qui sera pris.
  assert.match(modal, /getAutoSetupBalancesPublic/);
  assert.match(modal, /Portefeuille :/);
  assert.match(modal, /Safecoins :/);
});

test("une seule règle décide de la source du débit, partagée par les trois chemins", async () => {
  const [rule, autoSetup, remoteAccess, containerSetup] = await Promise.all([
    read("src/lib/billing/balance-source.ts"),
    read(AUTO_SETUP_ACTIONS),
    read(REMOTE_ACCESS_ACTIONS),
    read(CONTAINER_SETUP),
  ]);

  // Portefeuille FCFA d'abord (pas de frais de service), Safecoins en repli.
  assert.match(rule, /if \(walletFcfa >= amountFcfa\) return "wallet"/);
  assert.match(rule, /if \(safecoinAvailable && safecoinScCents >= requiredScCents\) return "safecoin"/);

  // Les trois chemins payants appellent la MÊME fonction : paywall accès
  // distant, paywall auto-setup, et le prélèvement d'exécution de l'auto-setup
  // quand rien n'a été payé d'avance. C'est ce partage qui empêche la
  // divergence — ils avaient divergé.
  for (const [name, src] of [
    ["auto-setup", autoSetup],
    ["remote-access", remoteAccess],
    ["container-setup", containerSetup],
  ]) {
    assert.match(src, /pickBalanceSource\(/, `${name} should use the shared rule`);
  }
});

test("le prélèvement d'exécution ne rend plus le portefeuille inaccessible", async () => {
  const source = await read(CONTAINER_SETUP);

  // RÉGRESSION : la simple EXISTENCE d'un compte Safecoin faisait renvoyer un
  // paywall « Solde Safecoin insuffisant » sans jamais regarder le portefeuille
  // — une org avec de quoi payer en FCFA et 0 SC était bloquée.
  assert.doesNotMatch(source, /if \(!safecoinAccount && walletBalanceCents < billableCents\)/);
  assert.doesNotMatch(
    source,
    /if \(billableCents !== null && billableCents > 0 && safecoinAccount\)/,
  );
  // Le débit suit désormais la source choisie, pas la présence d'un compte.
  assert.match(source, /if \(balanceSource === "safecoin"\)/);
  // Et le journal de fin d'auto-setup annonce la bonne source.
  assert.match(source, /balanceSource === "safecoin"[\s\S]{0,200}SC débités/);
});
