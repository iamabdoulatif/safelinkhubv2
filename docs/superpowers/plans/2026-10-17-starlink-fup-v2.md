# Starlink FUP v2 implementation plan

**Goal:** Connect the published observation workflow to trustworthy per-link data before enabling enforcement.

**Architecture:** Keep legacy regulation unchanged for other sites. Add a pure decimal-byte FUP ledger and budget calculation, reject observation requests before any router/database writes, and expose separately configured links to n8n. A configured v2 site must never fall through to the old cron policy. Historical screenshots and invoice dates are not live baselines.

**Tech Stack:** TypeScript, Node test runner, Next.js Route Handlers, PostgreSQL/Drizzle.

## Tasks

- [x] Write and run failing tests for 5 TB decimal accounting, 500 GB included reserve, cycle boundaries, 7/14/21/28 day windows, duplicate samples, reboot uncertainty and stale data.
- [x] Implement `src/lib/mikrotik/starlink-fup.ts` with independent ledgers per WAN and no invented baseline.
- [x] Test observation and disabled-route guards; implement `regulation-apply-guard.ts` and enforce it before writes in the apply API.
- [x] Add optional JSONB link configuration and ledger to `router_regulation`, with additive migration and configuration validation.
- [x] Extend router/read APIs with `fupLinks` and confirmed per-link measurements; serialize ledger changes and reject configuration races.
- [x] Exclude v2 links from the legacy automatic enforcement path and reject v2 apply until a verified WAN enforcement adapter exists.
- [x] Run focused tests, typecheck and lint; document the deployment/activation requirements explicitly.

- [ ] Deploy via normal CI, configure observation, reconcile provider readings, activate and verify the actual router state.

## Activation gate

Current provider baselines and exact data-cycle boundaries are required for all three links. A conservative shared cap, FastTrack handling, forwarding coverage for both IP families, a local 5-second guard and a serialized server authority are implemented. The shared cap protects the weakest remaining link during failover; it deliberately does not optimize WAN utilization. Publishing observation does not satisfy these requirements. Do not enable the legacy switch to bypass these gates.
