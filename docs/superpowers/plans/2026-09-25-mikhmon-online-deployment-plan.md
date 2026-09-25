# MikHmon Online Deployment Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let an operator provision and pay for a SafeLinkHub-hosted MikHmon instance from a polished deployment-plan interface, for RouterOS v6/v7 routers with or without Container, using an existing WireGuard, OpenVPN, or L2TP tunnel.

**Architecture:** Keep page data fetching server-side and isolate interactive deployment state in the existing console/dialog client boundary. A hosted MikHmon is available for every eligible router; a pre-existing local Container access remains a secondary, visible path. Pricing is service-specific, so the requested MikHmon prices do not change WinBox, WebFig, or SSH.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Drizzle, existing Server Actions, and tsx --test.

**Pricing decision:** The product already exposes 1/3/6/12 month durations. Apply the user's linear 500 FCFA/month instruction to MikHmon only: **500 / 1,500 / 3,000 / 6,000 FCFA**. Keep the current price table for all other remote-access services.

---

## File structure and boundaries

- src/lib/billing/remote-access-gate-config.ts: one pure, service-aware price lookup.
- src/lib/billing/remote-access-gate-config.test.ts: protects the MikHmon schedule and legacy prices.
- src/lib/billing/remote-access-authorization-actions.ts: applies authoritative prices in manual, online, and wallet flows.
- src/lib/safecoin/service-charges.ts and src/lib/mikrotik/port-forward.ts: debit the same price when the current activation flow charges directly.
- src/lib/mikrotik/mikhmon-cloud-activation.ts and mikhmon-online-access.ts: resolve L2TP and return hosted access for all router categories.
- src/lib/mikrotik/mikhmon-cloud-actions.ts: delete hosted accounting only, preserving a local port-forward.
- src/app/admin/mikhmon-online/page.tsx: distinguish local link data from a hosted accounting record.
- src/app/admin/mikhmon-online/MikhmonCloudActivationDialog.tsx: the four-stage product flow.
- src/app/admin/mikhmon-online/MikhmonOnlineList.tsx: unified fleet surface and launch action.

### Task 1: Lock the requested MikHmon pricing before UI work

**Files:**

- Create: src/lib/billing/remote-access-gate-config.test.ts
- Modify: src/lib/billing/remote-access-gate-config.ts
- Modify: src/lib/billing/remote-access-authorization-actions.ts
- Modify: src/lib/safecoin/service-charges.ts
- Modify: src/lib/mikrotik/port-forward.ts
- Modify: src/app/admin/remote-access/RemoteAccessPaywallModal.tsx

- [ ] **Step 1: Write the failing pricing test**

~~~ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remoteAccessPriceFcfa } from "./remote-access-gate-config";

describe("tarifs MikHmon Online", () => {
  it("applique 500 FCFA par mois sans changer les autres accès", () => {
    assert.equal(remoteAccessPriceFcfa("mikhmon", "monthly"), 500);
    assert.equal(remoteAccessPriceFcfa("mikhmon", "quarterly"), 1500);
    assert.equal(remoteAccessPriceFcfa("mikhmon", "semiannual"), 3000);
    assert.equal(remoteAccessPriceFcfa("mikhmon", "yearly"), 6000);
    assert.equal(remoteAccessPriceFcfa("winbox", "quarterly"), 1300);
  });
});
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: npx tsx --test src/lib/billing/remote-access-gate-config.test.ts

Expected: FAIL because the existing price helper accepts only the duration.

- [ ] **Step 3: Implement the pure service-aware price table**

In src/lib/billing/remote-access-gate-config.ts, add:

~~~ts
export const MIKHMON_ONLINE_PRICE_FCFA: Record<BillingPeriod, number> = {
  monthly: 500,
  quarterly: 1500,
  semiannual: 3000,
  yearly: 6000,
};

export function remoteAccessPriceFcfa(
  service: RemoteAccessService,
  period: BillingPeriod,
): number {
  return service === "mikhmon" ? MIKHMON_ONLINE_PRICE_FCFA[period] : PERIOD_PRICE_CENTS[period];
}
~~~

The public pricing landing continues to use PERIOD_PRICE_CENTS, which is the generic remote-access price.

- [ ] **Step 4: Make every payment and debit use the exact service price**

Replace each authorization-action lookup with remoteAccessPriceFcfa(service, billingPeriod). Add baseFcfa?: number to vpnActivationChargeScCents and calculate Safecoin from the override when present. Add baseFcfa?: number to chargeVpnActivation, use it as both the Safecoin base and referenceFcfaCents. In port-forward.ts, calculate:

~~~ts
const priceFcfa = remoteAccessPriceFcfa(service, billingPeriod);
~~~

Use this value for wallet sufficiency, wallet charge, and chargeVpnActivation. This avoids a successful 1,500 FCFA checkout being followed by a 1,300 FCFA ledger entry.

- [ ] **Step 5: Pass the selected service into the existing paywall view**

Change the initial amount, selected duration amount, duration cards, balance availability and online-payment label in RemoteAccessPaywallModal.tsx to use remoteAccessPriceFcfa(service, period).

- [ ] **Step 6: Run the focused test**

Run: npx tsx --test src/lib/billing/remote-access-gate-config.test.ts

Expected: PASS.

- [ ] **Step 7: Commit the isolated pricing change**

~~~bash
git add src/lib/billing/remote-access-gate-config.ts \
  src/lib/billing/remote-access-gate-config.test.ts \
  src/lib/billing/remote-access-authorization-actions.ts \
  src/lib/safecoin/service-charges.ts \
  src/lib/mikrotik/port-forward.ts \
  src/app/admin/remote-access/RemoteAccessPaywallModal.tsx
git commit -m "feat: price MikHmon Online by duration"
~~~

### Task 2: Allow hosted MikHmon on every managed tunnel

**Files:**

- Modify: src/lib/mikrotik/mikhmon-cloud-activation.ts
- Test: src/lib/mikrotik/mikhmon-cloud-activation.test.ts
- Modify: src/lib/mikrotik/mikhmon-online-access.ts
- Test: src/lib/mikrotik/mikhmon-online-access.test.ts
- Modify: src/lib/mikrotik/port-forward.ts
- Modify: src/lib/mikrotik/mikhmon-cloud-actions.ts

- [ ] **Step 1: Add failing unit tests**

~~~ts
assert.deepEqual(resolveMikhmonCloudTunnel("l2tp", "10.8.0.24"), {
  id: "l2tp", label: "L2TP", routerOsRange: "RouterOS 6.x et 7+", ready: true,
});

assert.deepEqual(resolveMikhmonAccess({
  supportsContainers: true,
  cloudDomain: "plateau.mikhmon.safelinkhub.io",
}), { kind: "cloud", url: "https://plateau.mikhmon.safelinkhub.io" });
~~~

- [ ] **Step 2: Run the tests to verify they fail**

Run: npx tsx --test src/lib/mikrotik/mikhmon-cloud-activation.test.ts src/lib/mikrotik/mikhmon-online-access.test.ts

Expected: FAIL because L2TP and cloud access on Container-capable routers are currently rejected.

- [ ] **Step 3: Implement the two pure rules**

Extend MikhmonCloudTunnel.id, label, and routerOsRange with L2TP, after the existing non-empty tunnelIp guard. Return the cloud HTTPS URL whenever a cloudDomain exists, regardless of supportsContainers.

- [ ] **Step 4: Provision cloud before checking a retained local access**

In enablePortForwardForRouter, treat every service === "mikhmon" as a cloud request. Validate it with resolveMikhmonCloudTunnel. Call ensureCloudMikhmonInstance before checking existing routerPortForwards, then identify its hosted accounting record by targetPort === cloud.localPort.

The existing local MikHmon forward targets 8089, so it cannot short-circuit hosted provisioning. Insert an accounting row only when the cloud record is absent. Leave WinBox, WebFig and SSH behaviour untouched. Never create a Container, VETH, RouterOS NAT rule, or L2TP configuration.

- [ ] **Step 5: Narrow cloud deletion to the cloud accounting record**

Fetch the cloud instance before removal and delete only its routerPortForwards row matching routerId, service mikhmon, and its localPort target. A local 8089 record remains intact.

- [ ] **Step 6: Run focused behavior tests**

Run: npx tsx --test src/lib/mikrotik/mikhmon-cloud-activation.test.ts src/lib/mikrotik/mikhmon-online-access.test.ts src/lib/mikrotik/port-forward.test.ts

Expected: PASS.

- [ ] **Step 7: Commit the hosted-access change**

~~~bash
git add src/lib/mikrotik/mikhmon-cloud-activation.ts \
  src/lib/mikrotik/mikhmon-cloud-activation.test.ts \
  src/lib/mikrotik/mikhmon-online-access.ts \
  src/lib/mikrotik/mikhmon-online-access.test.ts \
  src/lib/mikrotik/port-forward.ts \
  src/lib/mikrotik/mikhmon-cloud-actions.ts
git commit -m "feat: host MikHmon for every managed tunnel"
~~~

### Task 3: Build the product-designed deployment plan

**Files:**

- Modify: src/app/admin/mikhmon-online/page.tsx
- Modify: src/app/admin/mikhmon-online/MikhmonOnlineList.tsx
- Modify: src/app/admin/mikhmon-online/MikhmonCloudActivationDialog.tsx
- Test: src/app/admin/mikhmon-online/MikhmonOnlinePresentation.test.tsx

- [ ] **Step 1: Write the failing presentation tests**

Replace family-first assertions with the product flow:

~~~ts
assert.match(html, /Générer MikHmon Online/);
assert.match(html, /Plan de déploiement/);
assert.match(html, /WireGuard/);
assert.match(html, /OpenVPN/);
assert.match(html, /L2TP/);
assert.match(html, /1 mois/);
assert.match(html, /500 F CFA/);
assert.match(html, /Accès local/);
~~~

Use a Container-capable fixture with both cloudDomain and tunnelLink, proving that hosted domain and retained local link co-exist.

- [ ] **Step 2: Run the presentation test to verify it fails**

Run: npx tsx --test src/app/admin/mikhmon-online/MikhmonOnlinePresentation.test.tsx

Expected: FAIL because the current page splits cloud and Container routes and does not expose the deployment plan or prices.

- [ ] **Step 3: Preserve both links in the server loader**

Select targetPort with active MikHmon forwards. When a cloud instance exists, exclude the row whose target is instance.localPort; expose any remaining forward as tunnelLink. Pass supportsContainers through MikhmonRouter for edition recommendation.

- [ ] **Step 4: Generalize the dialog around a selectable router**

Give MikhmonCloudActivationDialog the router collection plus an optional preselected router ID. Keep only interaction state in the client boundary:

~~~ts
const [selectedRouterId, setSelectedRouterId] = useState(preselectedRouterId ?? "");
const [edition, setEdition] = useState<MikhmonEditionId>("v7");
const [period, setPeriod] = useState<BillingPeriod>("monthly");
const [slug, setSlug] = useState("");
~~~

Derive router, tunnel, recommendation and default slug from the selected ID. The user moves through router selection, connection review, edition plus duration, and domain confirmation. Submit via:

~~~ts
enablePortForward(router.id, "mikhmon", period, edition, slug)
~~~

On needsAuthorization, open the existing paywall with initialPeriod={period}; preserve selections and show the resulting payment state in the plan.

- [ ] **Step 5: Apply the SafeLinkHub product visual language**

Use one forest-green orientation surface (bg-slate-deep), lime progress and CTA accents (bg-brand), white cards, restrained rounded corners and existing Button classes. The visual story is Routeur → Tunnel → Cloud SafeLinkHub, not a generic form grid. Status always includes an icon and text, the dialog has an accessible name, Escape and overlay close, focus restoration, one pending control, and a stacked mobile composition. Add no dependency, gradient, blur, or decorative animation.

- [ ] **Step 6: Give the console one cloud-first primary action**

Add Générer MikHmon Online at the page head, useful fleet metrics (linked, active hosted domains, tunnel-ready, tunnel-needed), and a launch point from every route card. Label a retained Container link Accès local and the HTTPS domain MikHmon Online. Retain instance management controls for existing domains.

- [ ] **Step 7: Run the presentation test**

Run: npx tsx --test src/app/admin/mikhmon-online/MikhmonOnlinePresentation.test.tsx

Expected: PASS.

- [ ] **Step 8: Commit the interface**

~~~bash
git add src/app/admin/mikhmon-online/page.tsx \
  src/app/admin/mikhmon-online/MikhmonOnlineList.tsx \
  src/app/admin/mikhmon-online/MikhmonCloudActivationDialog.tsx \
  src/app/admin/mikhmon-online/MikhmonOnlinePresentation.test.tsx
git commit -m "feat: add MikHmon Online deployment plan"
~~~

### Task 4: Verify, document, commit, and deploy

**Files:**

- Modify: docs/superpowers/specs/2026-09-25-mikhmon-online-deployment-plan-design.md
- Modify: docs/superpowers/plans/2026-09-25-mikhmon-online-deployment-plan.md

- [ ] **Step 1: Record the payment schedule in the design spec**

Add the MikHmon-only 500/1,500/3,000/6,000 FCFA schedule and state that existing server-side payment methods remain authoritative.

- [ ] **Step 2: Run the full validation set**

Run:

~~~bash
npm test
npm run typecheck
npm run lint
npm run build
~~~

Expected: each exits 0.

- [ ] **Step 3: Review the UI against current Web Interface Guidelines**

Fetch https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md, review the changed dialog/list, and fix every actionable concern around accessibility, focus, keyboard use, layout, labels and status communication.

- [ ] **Step 4: Perform local visual verification**

Run the local app and inspect /admin/mikhmon-online with an authenticated account. Verify router selection, L2TP messaging, all prices, payment hand-off, local-access retention and a narrow viewport. Do not provision a real relay instance during UI validation.

- [ ] **Step 5: Create the final documentation commit**

~~~bash
git add docs/superpowers/specs/2026-09-25-mikhmon-online-deployment-plan-design.md \
  docs/superpowers/plans/2026-09-25-mikhmon-online-deployment-plan.md
git commit -m "docs: record MikHmon Online payment flow"
git status --short
~~~

Expected: only pre-existing unrelated untracked files remain outside the feature commits.

- [ ] **Step 6: Deploy the validated committed revision to production**

Inspect the repository deployment setup, confirm it targets safelinkhub.io, then use its configured Vercel production deployment command. Report the production URL and any prerequisite that prevents a live cloud instance.

