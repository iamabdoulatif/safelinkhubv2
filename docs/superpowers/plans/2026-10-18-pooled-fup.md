# Pooled FUP Implementation Plan

Execute inline. User specified cumulative 10 To and commercial ticket profiles of at least 2M/2M.

- [ ] Add failing tests: sum usage/reserve before decision, single WAN exhausted does not stop pool, total exhaustion does, reject unconfirmed/stale data, symmetric budget and 2M PCQ.
- [ ] Add optional pooled field and additive migration, default false; pure pooled budget and guard builder; retain individual-mode tests.
- [ ] Wire server enforcement, settings UI, internal n8n observations/list, runtime and notifications to cumulative policy.
- [ ] Test focused and full suites, typecheck/lint/build; deploy normally.
- [ ] Configure FOUANGA only while keeping FUP off; backup router, apply commercial profiles/base PCQ and FastTrack exclusion, inspect CPU/state and verify pool readout. Preserve KONGASSO.
