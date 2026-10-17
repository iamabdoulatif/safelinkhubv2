# MikHmon Credentials Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a branded Maintenance flow that lets every authorized router user confirm and restore MikHmon access to `mikhmon / 1234`, then deploy it to the SaaS.

**Architecture:** Keep the existing Maintenance menu and server-action authorization boundary. Add a dedicated reset action that writes the default password both to the router's MikHmon config and to the encrypted database field, and add a focused client modal for status, confirmation, progress, and result states.

**Tech Stack:** Next.js App Router, React client components, Server Actions, Drizzle/PostgreSQL, RouterOS API, Tailwind tokens, Vitest/tsx tests, Docker/VPS deployment.

---

### Task 1: Add the safe default-password domain operation

**Files:**
- Modify: `src/lib/mikrotik/hardening.ts`
- Modify: `src/lib/mikrotik/mikhmon-admin-password.ts`
- Test: `src/lib/mikrotik/hardening.test.ts`

- [ ] **Step 1: Write the failing test**

Add a pure helper assertion that the MikHmon default is `1234` and that its legacy encrypted representation is the same value used by the session writer.

- [ ] **Step 2: Run the focused test and confirm the baseline**

Run `npx tsx --test src/lib/mikrotik/hardening.test.ts` and confirm the new assertion fails before the helper is exported.

- [ ] **Step 3: Implement the minimal domain helper**

Export `MIKHMON_DEFAULT_PASSWORD = "1234"` from `hardening.ts` and use it in `MIKHMON_DEFAULT_PASSWORD_ENC`. Import that constant wherever the reset action needs the default so the UI behavior has one source of truth.

- [ ] **Step 4: Run the focused test**

Run `npx tsx --test src/lib/mikrotik/hardening.test.ts`; expected result is PASS.

### Task 2: Add the authorized reset server action

**Files:**
- Modify: `src/lib/mikrotik/actions.ts`
- Modify: `src/lib/mikrotik/mikhmon-session.ts`
- Test: `src/lib/mikrotik/actions.test.ts` or the nearest existing MikHmon action test file.

- [ ] **Step 1: Reuse the existing reconfiguration path**

Extract the common route connection, container lookup, hotspot/DNS discovery, and `writeMikhmonSession` call from `reconfigureMikhmonSession` into a private helper that accepts `adminPassword` and returns the same error strings. Keep the existing action behavior unchanged by passing the stored/generated password to it.

- [ ] **Step 2: Add `resetMikhmonAdminPassword(routerId)`**

The action must call `getSession`, reject a missing session, load the router, enforce `router.orgId === session.orgId || isSuperAdmin(session.role)`, verify connection credentials, connect to RouterOS, locate the MikHmon container, and call the shared writer with `adminPassword: MIKHMON_DEFAULT_PASSWORD`. Only after the router write succeeds, update `mikhmonAdminPasswordEncrypted` with `encryptSecret(MIKHMON_DEFAULT_PASSWORD)`, update `mikhmonSessionAt`, revalidate `/admin/router/${routerId}`, and return a success summary.

- [ ] **Step 3: Add tests for authorization and failure ordering**

Cover unauthenticated access, another organization, successful reset, offline router, missing container, and the invariant that a failed router write does not update the encrypted database field.

- [ ] **Step 4: Run focused action tests and typecheck**

Run `npx tsx --test src/lib/mikrotik/actions.test.ts` (or the matching focused file) and `npm run typecheck`; expected result is PASS.

### Task 3: Build the SafeLinkHub-branded variant C modal

**Files:**
- Create: `src/app/admin/router/[id]/MikhmonCredentialsDialog.tsx`
- Modify: `src/app/admin/router/[id]/HeaderActions.tsx`
- Test: `src/app/admin/router/[id]/MikhmonCredentialsDialog.test.tsx`

- [ ] **Step 1: Add the dialog test**

Render the dialog with a configured state and assert the `Identifiants MikHmon` title, a visible status message, the `1234` emergency-reset label, and the confirmation copy. Assert that clicking the reset button invokes the callback only after the confirmation button is clicked.

- [ ] **Step 2: Implement the modal**

Use the existing `paper`, `clay`, `ink`, `ink-soft`, `line`, `brand`, `brand-deep`, `err`, and `err-soft` Tailwind tokens. Include `role="dialog"`, `aria-modal="true"`, an accessible title, focus on open, Escape/cancel handling, loading state, error state, and success state. Mask the current password by default and provide a deliberate reveal action. Place the red `Restaurer 1234` button only inside the separated emergency block.

- [ ] **Step 3: Wire it to Maintenance**

Replace the immediate `getMikhmonAdminCredentials` action in `HeaderActions.tsx` with dialog open state. Load credentials when opening, pass the existing password/status to the dialog, and call `resetMikhmonAdminPassword` after confirmation. Refresh the router page after success without closing the dialog until the result is visible.

- [ ] **Step 4: Run the component test and lint**

Run `npx tsx --test 'src/app/admin/router/[id]/MikhmonCredentialsDialog.test.tsx'` and `npm run lint`; expected result is PASS with no new warnings.

### Task 4: Full verification and deployment

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-mikhmon-credentials-maintenance-design.md` only if implementation details require clarification.

- [ ] **Step 1: Run the full relevant verification**

Run `npm test -- --test-name-pattern='mikhmon|router|relay'`, `npm run typecheck`, `npm run lint`, and `git diff --check`.

- [ ] **Step 2: Review the diff and commit the feature**

Review `git diff`, ensure no secrets or generated brainstorm files are included, then commit the feature with `git add` on only the implementation/test files and `git commit -m "feat: restaurer les identifiants Mikhmon par defaut"`.

- [ ] **Step 3: Deploy the SaaS**

Use the repository's existing deployment command/configuration after confirming the target is production. Monitor the deployment until it reports success; do not expose deployment secrets.

- [ ] **Step 4: Verify production**

Open the production router page, open Maintenance → Identifiants MikHmon, verify the variant C modal, confirm the reset action on a reachable test router, and verify the success notice and credentials display.
