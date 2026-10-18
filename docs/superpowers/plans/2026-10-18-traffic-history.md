# Traffic history implementation plan

**Goal:** Add five-minute per-WAN traffic history and sourced incident periods.
**Architecture:** Pure counter/period calculations, bounded read-only collector, PostgreSQL samples and baseline state, authorized server actions, theme-preserving history tab.

- [x] Test and implement counter arithmetic, session activity, data gaps and observed restriction periods in traffic-history.ts.
- [x] Add 0017 migration and SQL mirror: samples, baselines and manually sourced incidents; unique router/link/bucket and router/bucket keys.
- [x] Implement lightweight RouterOS reader and opt-in, private graphing activation with idempotence tests.
- [x] Implement collector with per-router database advisory lock, slot deduplication, safe partial readings and budget; call before existing health work.
- [x] Implement authorized history reads, raw CSV data, incident recording/closure and graphing action.
- [x] Add history tab with per-link rates/volumes, router user activity, gaps, incident timeline, date controls and CSV export.
- [x] Verify migration, meaningful tests, typecheck/lint and browser preview; report limitations and deployment status accurately.

Validation: full tests, typecheck, scoped lint, PostgreSQL transactional migration checks (duplicate slots, incident chronology, cascading deletion), isolated real-component browser preview at 1440px and 390px with preserved #D6F344, chart gaps, incident recording and CSV download. Independent review corrected collector fairness and unknown previous session counters; regression tests added. No router configuration was changed during verification.
