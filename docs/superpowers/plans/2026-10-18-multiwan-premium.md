# Multi-WAN Premium implementation plan

Goal: router-scoped 15 000 FCFA licence and a validated RouterOS multi-WAN script generator.

- [x] Add failing generator/pricing/validation tests, then implement pure generator with primary RouterOS references.
- [x] Add next migration and mirrored SQL for router licences and saved generation settings.
- [x] Implement atomic PostgreSQL billing shared by both currencies, with concurrency and rollback integration checks.
- [x] Implement authenticated actions, permanent access checks and server-only generation; test paywall/org isolation.
- [x] Add theme-matched offline-accessible router tab, pre-purchase summary, explicit payment source, script copy/download and regeneration.
- [ ] Independently review, run tests/typecheck/lint and browser verification; commit and deploy through established VPS workflow; verify migration without charging a real customer.
