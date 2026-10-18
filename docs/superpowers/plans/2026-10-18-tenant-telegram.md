# Tenant Telegram Implementation Plan

> Execute inline using executing-plans. User approved the design and asked for implementation; no additional execution-choice gate.

**Goal:** Each organization admin connects a private Telegram bot and receives only its selected routers' FUP alerts.
**Architecture:** Authenticated server actions, encrypted organization settings, expiring one-use pairing challenge, read-only Telegram polling during pairing, durable notification outbox and bounded cron delivery. Existing superadmin n8n credentials remain independent.
**Tech Stack:** Next16 server actions, React19, Drizzle/Postgres, official Telegram Bot API.

## Tasks
- [x] Add failing tests for strict Telegram API validation, secret-safe errors, challenge expiry/private matching, preferences and tenant scoping. Run `npx tsx --test src/lib/notifications/telegram*.test.ts` and observe failures before implementation.
- [x] Implement Telegram client and pure pairing/preferences/notification rules in `src/lib/notifications/telegram.ts`. Use fixed official API host, bounded fetch, getMe/getWebhookInfo/getUpdates/getChat/sendMessage. Match only exact expiring challenge; never clear webhooks.
- [x] Add organization settings and delivery tables to `src/lib/db/schema.ts`, embedded additive migration `0018_org_telegram`, mirrored SQL and migration regression. Settings include token cipher, unique bot ID, pending challenge, confirmed recipient, preferences, selected router IDs, configuration revision. Outbox unique org/event identity, bounded attempts, lease, safe errors.
- [x] Implement admin-only server actions in `telegram-actions.ts`, scoped by session org; protect transitions with row locks, invalidate previous connections on token replacement, verify all selected routers belong to org, require recipient confirmation, test before activation. Never return tokens. Rate limit external calls per organization in DB.
- [x] Implement worker in `telegram-delivery.ts`: consume FUP events, read confirmed current ledgers for quota warnings, daily summary after 07:00 UTC, deduplicate, bound retries and concurrent claims, drop obsolete configuration deliveries. Register independent background task in existing authorized 5-minute cron. No router commands and no changes to FUP policy.
- [x] Add `/admin/settings/notifications` page and client assistant, navigation, guide/download. Private destination default, manual Chat ID advanced, choose routers/events, connect/confirm/test/enable/disconnect, readable failure states and recent deliveries.
- [x] Run focused tests then full `npm test`, `npm run typecheck`, lint/build. Verify UI and secret absence, create/attach PR, merge through authorized deployment and verify live page and migration.

## Self-review
BotFather remains necessary for this user-owned bot flow. Polling never replaces existing webhook. Pairing checks creator user, org, revision and challenge expiry. Worker sends only after committed server events and settings consent. Telegram cannot guarantee exactly once after an ambiguous network timeout; use bounded retry and disclose in operations guide. All clock labels UTC.

## Verification evidence

Full suite: 1388 passed, 1 integration suite skipped unless TEST_DATABASE_URL is supplied. Explicit PostgreSQL run: 10 passed. Typecheck and lint passed (two existing unrelated warnings). Local production build passed with the existing instrumentation Edge warning. Production browser/migration verification follows deployment.
