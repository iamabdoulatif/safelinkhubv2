# Reprise sécurisée des accès VPN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Ajouter le coffre Superadmin des services achetés et le remplacement d'un MikroTik sans perte de service ni nouveau paiement.

**Architecture:** Une reprise lie un routeur source à un remplacement. Le remplacement reçoit une clé WireGuard/OpenVPN neuve, puis son callback transfère les forwards existants vers sa nouvelle IP tunnel, préserve ports et échéances, et révoque le pair de l'ancien routeur. Le coffre révèle les secrets par Server Action uniquement.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle/Neon PostgreSQL, RouterOS, WireGuard/OpenVPN relay, Node test runner, Tailwind CSS.

---

### Task 1: Créer les données et contrats purs de reprise

**Files:**
- Create: src/lib/mikrotik/router-recovery.ts
- Create: src/lib/mikrotik/router-recovery.test.ts
- Modify: src/lib/db/schema.ts
- Create: scripts/add-vpn-recovery.sql

- [ ] **Step 1: Write the failing test**

~~~ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canStartRouterReplacement, canRetryReplacement, isReplacementAutoSetupRetry } from "./router-recovery";

describe("reprise de routeur", () => {
  it("n'autorise qu'une reprise non terminée à être relancée", () => {
    assert.equal(canStartRouterReplacement(null), true);
    assert.equal(canStartRouterReplacement("pending"), false);
    assert.equal(canRetryReplacement("pending"), true);
    assert.equal(canRetryReplacement("installing"), false);
    assert.equal(canRetryReplacement("failed"), true);
  });
  it("hérite l'Auto-Setup seulement du même payeur", () => {
    assert.equal(isReplacementAutoSetupRetry("approved", "payer", "payer", "completed"), true);
    assert.equal(isReplacementAutoSetupRetry("approved", "payer", "other", "completed"), false);
  });
});
~~~

- [ ] **Step 2: Run the test and verify RED**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts
Expected: failure because router-recovery does not exist.

- [ ] **Step 3: Implement minimally**

Declare routerReplacements with source/replacement IDs, org, requester, safe error text, timestamps and status pending, installing, completed, cancelled or failed. Declare vpnAccessAuditEvents with actor, org, router, optional replacement, action and timestamp only. Use a partial unique index to allow only one active recovery per source router. Add the matching idempotent PostgreSQL migration. No password, script or raw token is persisted.

- [ ] **Step 4: Run GREEN**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

Run: git add src/lib/db/schema.ts scripts/add-vpn-recovery.sql src/lib/mikrotik/router-recovery.ts src/lib/mikrotik/router-recovery.test.ts
Run: git commit -m "feat: ajoute les données de reprise VPN"

### Task 2: Générer un script de remplacement temporaire

**Files:**
- Create: src/lib/mikrotik/router-recovery-service.ts
- Create: src/lib/mikrotik/router-recovery-actions.ts
- Modify: src/lib/mikrotik/actions.ts
- Test: src/lib/mikrotik/router-recovery.test.ts

- [ ] **Step 1: Write the failing test**

~~~ts
it("construit un script temporaire sans exporter de clé privée", () => {
  const command = buildReplacementInstallCommand("https://app.example/api/router/v1/acme/scripts/install-vpn", "raw-token");
  assert.match(command, /Authorization: Bearer raw-token/);
  assert.match(command, /dst-path="vpn.rsc"/);
  assert.doesNotMatch(command, /PrivateKey/);
});
~~~

- [ ] **Step 2: Run RED**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts
Expected: failure because the command builder is missing.

- [ ] **Step 3: Implement minimally**

Extract WireGuard/OpenVPN command assembly from actions.ts. Start replacement must verify organization ownership, create one pending replacement with fresh API password and token hash, copy last Auto-Setup configuration and return a one-time command. Reissue rotates only hash/expiry for pending or failed rows. Cancel works only before installation. Raw token is never saved.

- [ ] **Step 4: Run GREEN and commit**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts
Run: git add src/lib/mikrotik/actions.ts src/lib/mikrotik/router-recovery*.ts
Run: git commit -m "feat: génère des scripts de remplacement VPN"

### Task 3: Basculer les services sans attribuer de nouveaux ports

**Files:**
- Modify: src/lib/mikrotik/relay.ts
- Modify: src/lib/mikrotik/relay.test.ts
- Modify: src/lib/mikrotik/router-recovery-service.ts

- [ ] **Step 1: Write the failing test**

~~~ts
it("garde le port public en remplaçant seulement l'IP tunnel", () => {
  const script = buildRelayForwardReplacement("10.66.0.10", "10.66.0.11", [{ targetPort: 8291, publicPort: 39001, tlsTerminated: false }]);
  assert.match(script, /10\.66\.0\.10:8291/);
  assert.match(script, /10\.66\.0\.11:8291/);
  assert.match(script, /39001/);
});
~~~

- [ ] **Step 2: Run RED**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/relay.test.ts
Expected: failure because buildRelayForwardReplacement is missing.

- [ ] **Step 3: Implement minimally**

Add replaceRouterPortForwards(oldTunnelIp, newTunnelIp, forwards). It removes exact old DNAT, MASQUERADE and FORWARD entries then ensures new entries for exactly the same public ports. For WebFig and MikHmon replace only reservation markers. Persist iptables after all rows. Repeated execution converges on the new IP and never calls allocation.

- [ ] **Step 4: Run GREEN and commit**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/relay.test.ts src/lib/mikrotik/router-recovery.test.ts
Run: git add src/lib/mikrotik/relay.ts src/lib/mikrotik/relay.test.ts src/lib/mikrotik/router-recovery-service.ts
Run: git commit -m "feat: conserve les ports pendant une reprise VPN"

### Task 4: Finaliser la reprise depuis WireGuard et OpenVPN

**Files:**
- Modify: src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts
- Modify: src/app/api/router/v1/[slug]/scripts/install-vpn/installed/route.ts
- Modify: src/app/api/router/v1/[slug]/scripts/install-openvpn/route.ts
- Modify: src/app/api/router/v1/[slug]/scripts/install-openvpn/installed/route.ts
- Modify: src/lib/mikrotik/router-recovery-service.ts

- [ ] **Step 1: Write the failing test**

~~~ts
it("prévoit le transfert puis la révocation de l'ancien pair", () => {
  assert.deepEqual(replacementCompletionPlan("vpn"), ["replace-forwards", "move-records", "revoke-wireguard-peer", "complete"]);
  assert.deepEqual(replacementCompletionPlan("openvpn"), ["replace-forwards", "move-records", "revoke-openvpn-peer", "complete"]);
});
~~~

- [ ] **Step 2: Run RED**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts
Expected: failure because replacementCompletionPlan is missing.

- [ ] **Step 3: Implement minimally**

When script routes recognize a replacement, set it installing. Their installed callbacks call completeRouterReplacement: collect source forwards, move relay rules idempotently, transactionally move forward router ID and tunnel IP, set source status replaced, write audit, revoke the old peer, then mark completed. Failure records only safe diagnostics and remains retryable. Never delete an old router, forward or wallet record.

- [ ] **Step 4: Run GREEN and commit**

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts src/lib/mikrotik/relay.test.ts
Run: git add src/app/api/router/v1 src/lib/mikrotik/router-recovery*.ts
Run: git commit -m "feat: finalise la reprise depuis les callbacks VPN"

### Task 5: Transmettre seulement le droit Auto-Setup du payeur

**Files:**
- Modify: src/lib/billing/auto-setup-authorization-service.ts
- Modify: src/lib/billing/auto-setup-authorization-service.test.ts
- Modify: src/lib/mikrotik/container-setup.ts

- [ ] **Step 1: Write the failing test**

~~~ts
it("refuse la reprise Auto-Setup d'un remplacement à un autre utilisateur", () => {
  assert.equal(isReplacementAutoSetupRetry("approved", "paid-user", "another-user", "completed"), false);
});
~~~

- [ ] **Step 2: Run RED, then implement and run GREEN**

The Auto-Setup gate recognizes a replacement only when it is non-cancelled, the source has an approved authorization and its payer equals session.userId. It returns replacement_paid_retry, never consumes it, and billing treats it like paid_retry. Superadmin stays unchanged.

Run: node_modules/.bin/tsx --test src/lib/billing/auto-setup-authorization-service.test.ts src/lib/mikrotik/router-recovery.test.ts
Run: git add src/lib/billing/auto-setup-authorization-service.ts src/lib/billing/auto-setup-authorization-service.test.ts src/lib/mikrotik/container-setup.ts
Run: git commit -m "feat: transmet le droit auto-setup au remplacement"

### Task 6: Construire le coffre Superadmin sans fuite de secret

**Files:**
- Create: src/lib/mikrotik/vpn-access-vault-actions.ts
- Create: src/app/admin/vpn-access/page.tsx
- Create: src/app/admin/vpn-access/VpnAccessVault.tsx
- Modify: src/components/AdminSidebar.tsx

- [ ] **Step 1: Write the failing test**

~~~ts
it("prépare un message support sans mot de passe par défaut", () => {
  const message = formatVpnAccessWhatsappMessage({ routerName: "Site A", username: "safelinkhub-api", password: null, services: ["winbox"] });
  assert.match(message, /Site A/);
  assert.doesNotMatch(message, /undefined|null/);
});
~~~

- [ ] **Step 2: Run RED, then implement and run GREEN**

The server page redirects non-superadmins and selects active forward, organization and router metadata without decrypting a password. The client uses paper/clay/ink/brand styles and supports search, service badges, expiry, reveal, copy and WhatsApp preparation. Reveal verifies superadmin, decrypts only one router password, audits revealed and returns it. Copy and WhatsApp audit only action names. Browser state clears the revealed secret on close. Add Accès VPN clients with ShieldKey to the existing Superadmin menu.

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts
Run: git add src/lib/mikrotik/vpn-access-vault-actions.ts src/app/admin/vpn-access src/components/AdminSidebar.tsx src/lib/mikrotik/router-recovery*.ts
Run: git commit -m "feat: ajoute le coffre superadmin des accès VPN"

### Task 7: Ajouter la reprise au menu Accès distant

**Files:**
- Create: src/app/admin/remote-access/RouterRecoveryCard.tsx
- Modify: src/app/admin/remote-access/DirectAccessSection.tsx
- Modify: src/app/admin/remote-access/page.tsx

- [ ] **Step 1: Write the failing test**

~~~ts
it("affiche un état compréhensible pendant la préparation MikHmon", () => {
  assert.equal(replacementStatusLabel("installing", true), "Connexion du routeur de remplacement…");
  assert.equal(replacementStatusLabel("completed", true), "Préparation MikHmon requise");
});
~~~

- [ ] **Step 2: Run RED, then implement and run GREEN**

Pass latest recovery state from the server page into each eligible tunnel card. Add a compact panel with source services, confirmation, replacement name/method, one-time script viewer, pending/installing/failed/completed states, retry/cancel controls and a backup link when MikHmon awaits restoration. Reuse Copy, ShieldCheck, Loader2 and existing SafeLinkHub button classes.

Run: node_modules/.bin/tsx --test src/lib/mikrotik/router-recovery.test.ts
Run: git add src/app/admin/remote-access src/lib/mikrotik/router-recovery*.ts
Run: git commit -m "feat: ajoute le remplacement de routeur à l'accès distant"

### Task 8: Vérifier, migrer et déployer

- [ ] **Step 1: Run all tests**

Run: rg --files src -g '*.test.ts' | sort | xargs node_modules/.bin/tsx --test
Expected: all tests pass.

- [ ] **Step 2: Typecheck, lint and build**

Run: npx tsc --noEmit && npm run lint && npm run build && git diff --check
Expected: zero errors.

- [ ] **Step 3: Apply production migration before application deployment**

Run in /root/safelinkhub-app after source sync: node --env-file=.env.local scripts/run-sql.mjs scripts/add-vpn-recovery.sql
Expected: migration succeeds twice without changing existing rows.

- [ ] **Step 4: Push and deploy**

Run: git push origin main
Run: rsync -az --exclude '.git' --exclude '.next' --exclude 'node_modules' --exclude '.env*' --exclude '.codex' --exclude '.superpowers' ./ root@31.97.153.83:/root/staging-slh-vpn-recovery/
Run: ssh root@31.97.153.83 'DEPLOY_BY=codex-vpn-recovery SRC=/root/staging-slh-vpn-recovery /root/deploy-slh.sh'

- [ ] **Step 5: Verify production**

Run: curl -sS -I --connect-timeout 10 https://safelinkhub.io/admin/vpn-access
Run: ssh root@31.97.153.83 'docker inspect -f "{{.Config.Image}} {{.State.Status}} {{.RestartCount}}" slh-app'
Expected: protected-page login redirect, new running image, restart count 0.
