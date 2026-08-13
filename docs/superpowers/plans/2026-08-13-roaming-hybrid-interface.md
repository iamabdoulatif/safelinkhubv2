# Roaming Hybrid Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single long Roaming console with an operations-first interface while preserving every existing Server Action and safety behavior.

**Architecture:** Keep `page.tsx` as the server-side data loader and mutations in `src/lib/roaming/actions.ts`. Refactor only `RoamingConsole.tsx`: local tab state selects operations, groups, catalogue or accounts; local drawer state presents the existing forms without changing their fields or action bindings.

**Tech Stack:** Next.js 16 App Router, React 19 `useActionState`, TypeScript, Tailwind CSS 4, Lucide icons, Node test runner with `tsx`.

---

### Task 1: Lock the UI contract with regression tests

**Files:**
- Modify: `test/roaming-named-user.test.mjs`
- Modify: `src/app/admin/roaming/RoamingConsole.tsx`

- [ ] **Step 1: Write the failing tests**

```js
test("la station roaming expose les quatre vues de la refonte", async () => {
  const console = await read("src/app/admin/roaming/RoamingConsole.tsx");
  for (const label of ["Exploitation", "Groupes", "Catalogue", "Comptes"]) {
    assert.match(console, new RegExp(`>${label}<`));
  }
  assert.match(console, /const \[activeView, setActiveView\]/);
});

test("l émission est ouverte depuis un tiroir guidé", async () => {
  const console = await read("src/app/admin/roaming/RoamingConsole.tsx");
  assert.match(console, /const \[drawer, setDrawer\]/);
  assert.match(console, /Créer des accès/);
  assert.match(console, /Vérifier avant création/);
  assert.match(console, /action=\{ticketAction\}/);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- --test-name-pattern='station roaming expose|émission est ouverte'`

Expected: FAIL because `activeView`, `drawer`, the local navigation labels and the guided drawer do not exist.

- [ ] **Step 3: Implement the smallest UI boundary**

Add `RoamingView` and `Drawer` unions inside `RoamingConsole.tsx`; make navigation buttons set `activeView`; make the primary action set `drawer` to `"tickets"`. Do not add a Server Action.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm test -- --test-name-pattern='station roaming expose|émission est ouverte'`

Expected: both tests pass.

### Task 2: Build the Exploitation view and ticket drawer

**Files:**
- Modify: `src/app/admin/roaming/RoamingConsole.tsx`
- Modify: `test/roaming-named-user.test.mjs`

- [ ] **Step 1: Write the failing status test**

```js
test("la vue exploitation montre la couverture et les zones à vérifier", async () => {
  const console = await read("src/app/admin/roaming/RoamingConsole.tsx");
  assert.match(console, /Zones en ligne/);
  assert.match(console, /À vérifier/);
  assert.match(console, /group\.routers\.filter\(\(router\) => router\.status === "online"\)/);
  assert.match(console, /zones non joignables/);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- --test-name-pattern='vue exploitation montre'`

Expected: FAIL because the operations health summary does not exist.

- [ ] **Step 3: Implement the operations-first surface**

Render the selected active group in a dark, editorial operations header. Show online and offline counts using `group.routers`, compact zone cards with text status, and an activity/alert rail. Place the current `ticketAction` form in the tickets drawer, retaining `groupId`, `offerId`, `quantity`, `prefix`, `note`, disabled states and `<Notice state={ticketState} />`.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm test -- --test-name-pattern='vue exploitation montre|émission est ouverte'`

Expected: both operations tests pass.

### Task 3: Separate Groups, Catalogue and Accounts views

**Files:**
- Modify: `src/app/admin/roaming/RoamingConsole.tsx`
- Modify: `test/roaming-named-user.test.mjs`

- [ ] **Step 1: Write the failing action-preservation tests**

```js
test("les vues groupes et catalogue préservent leurs actions protégées", async () => {
  const console = await read("src/app/admin/roaming/RoamingConsole.tsx");
  for (const action of ["groupAction", "groupZoneAction", "groupToggleAction", "groupDropAction", "profileAction", "offerAction", "offerToggleAction", "offerDropAction"]) {
    assert.match(console, new RegExp(`action=\\{${action}\\}`));
  }
  assert.match(console, /drawer === "zone"/);
});

test("la vue comptes conserve les retours au compte concerné", async () => {
  const console = await read("src/app/admin/roaming/RoamingConsole.tsx");
  assert.match(console, /activeView === "accounts"/);
  assert.match(console, /confirmingId === user\.id/);
  assert.match(console, /editingId === user\.id/);
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm test -- --test-name-pattern='vues groupes et catalogue|vue comptes conserve'`

Expected: FAIL because views and the zone drawer do not exist.

- [ ] **Step 3: Implement the separated views**

Render Groups as a comparative table/card list with online count; selecting one returns to Exploitation. Put new-group controls in a drawer and retain pause/resume/delete confirmations. Render profiles and offers in Catalogue with their existing controls. Open the existing zone selection form in the zone drawer. In Accounts, retain the existing list, password reveal, edit form, two-step deletion and adjacent notices; open account creation from its own drawer.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `npm test -- --test-name-pattern='vues groupes et catalogue|vue comptes conserve|zone ajoutée|résultat de modifier'`

Expected: all selected tests pass.

### Task 4: Full verification, commit and VPS release

**Files:**
- Modify: `src/app/admin/roaming/RoamingConsole.tsx`
- Modify: `test/roaming-named-user.test.mjs`
- Create: `docs/superpowers/plans/2026-08-13-roaming-hybrid-interface.md`

- [ ] **Step 1: Run full quality gates**

Run: `git diff --check && npm test && npm run typecheck && npm run lint && npm run build`

Expected: no test, type, lint error or build failure. Report any unrelated pre-existing lint warning separately.

- [ ] **Step 2: Inspect the release diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: only the Roaming console, its regression tests, the accepted design spec and this plan are staged; the unrelated plan file is excluded.

- [ ] **Step 3: Commit, push and deploy**

```bash
git add src/app/admin/roaming/RoamingConsole.tsx test/roaming-named-user.test.mjs docs/superpowers/specs/2026-08-13-roaming-hybrid-design.md docs/superpowers/plans/2026-08-13-roaming-hybrid-interface.md
git commit -m "feat(roaming): redesign operations console"
git push origin main
gh run watch <run-id> --exit-status
```

After GitHub Actions publishes the image, verify `slh-app` uses the pushed SHA on the VPS and that `https://safelinkhub.io/` returns 200.
