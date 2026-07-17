import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("login redirects only to internal admin callbacks", async () => {
  const source = await readFile(new URL("../src/lib/auth/actions.ts", import.meta.url), "utf8");

  assert.match(source, /safeCallbackPath/);
  assert.match(source, /callback\.startsWith\("\/admin"\)/);
  assert.doesNotMatch(source, /redirect\(callback \|\| "\/admin"\)/);
});

test("admin layout rejects non-admin sessions", async () => {
  const source = await readFile(new URL("../src/app/admin/layout.tsx", import.meta.url), "utf8");

  assert.match(source, /!isAdminRole\(session\.role\)/);
  assert.match(source, /redirect\("\/auth\/login\?callback=\/admin"\)/);
});

test("admin layout opts out of build-time prerender before reading session and database", async () => {
  const source = await readFile(new URL("../src/app/admin/layout.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ connection \} from "next\/server"/);
  assert.ok(
    source.indexOf("await connection()") < source.indexOf("getSession()"),
    "request-time rendering must be declared before session/database reads",
  );
});

test("auth layout opts out of build-time prerender for session-aware auth pages", async () => {
  const source = await readFile(new URL("../src/app/auth/layout.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ connection \} from "next\/server"/);
  assert.match(source, /await connection\(\)/);
});

test("isAdminRole accepts admin and superadmin, rejects everything else", async () => {
  const source = await readFile(new URL("../src/lib/auth/session.ts", import.meta.url), "utf8");

  assert.match(source, /role === "admin" \|\| role === "superadmin"/);
  assert.match(source, /export function isSuperAdmin/);
});

test("package actions require admin session and validate finite numeric fields", async () => {
  const source = await readFile(new URL("../src/lib/packages/actions.ts", import.meta.url), "utf8");

  assert.match(source, /requireAdminSession/);
  assert.match(source, /Number\.isFinite\(durationValue\)/);
  assert.match(source, /Number\.isFinite\(price\)/);
  assert.match(source, /Number\.isFinite\(uploadMbps\)/);
  assert.match(source, /Number\.isFinite\(downloadMbps\)/);
});

test("voucher generation verifies package ownership before insert", async () => {
  const source = await readFile(new URL("../src/lib/vouchers/actions.ts", import.meta.url), "utf8");

  assert.match(source, /requireAdminSession/);
  assert.match(source, /eq\(packages\.orgId, session\.orgId\)/);
  assert.match(source, /Forfait introuvable/);
});

test("portal payment creation atomically claims a pending order before calling GeniusPay", async () => {
  const source = await readFile(
    new URL("../src/app/api/portal/[slug]/pay/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /payment_initiating/);
  assert.match(source, /isNull\(portalOrders\.paymentReference\)/);
  assert.ok(
    source.indexOf('status: "payment_initiating"') < source.indexOf("createOrgPayment(creds"),
    "the order must be claimed before the external payment is created",
  );
  assert.match(source, /paymentReference: portalOrders\.paymentReference/);
});

test("marketing analytics IDs are validated and escaped before script injection", async () => {
  const actions = await readFile(new URL("../src/lib/marketing/actions.ts", import.meta.url), "utf8");
  const scripts = await readFile(
    new URL("../src/components/analytics/AnalyticsScripts.tsx", import.meta.url),
    "utf8",
  );

  assert.match(actions, /validateMarketingId/);
  assert.match(actions, /ga4MeasurementId/);
  assert.match(actions, /adsenseClientId/);
  assert.match(scripts, /JSON\.stringify/);
  assert.doesNotMatch(scripts, /gtag\('config','\$\{ga4MeasurementId\}'\)/);
  assert.doesNotMatch(scripts, /fbq\('init','\$\{metaPixelId\}'\)/);
});

test("public contact and testimonial submissions enforce IP rate limits", async () => {
  const contact = await readFile(new URL("../src/lib/contact/actions.ts", import.meta.url), "utf8");
  const testimonials = await readFile(new URL("../src/lib/testimonials/actions.ts", import.meta.url), "utf8");
  const limiter = await readFile(new URL("../src/lib/public-rate-limit.ts", import.meta.url), "utf8");

  assert.match(contact, /enforcePublicSubmissionRateLimit\("contact"\)/);
  assert.match(testimonials, /enforcePublicSubmissionRateLimit\("testimonial"\)/);
  assert.match(limiter, /PUBLIC_SUBMISSION_WINDOW_MINUTES/);
  assert.match(limiter, /publicSubmissionAttempts/);
});

test("Next build does not depend on fetching Google Fonts at build time", async () => {
  const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  const globals = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.match(globals, /--font-syne:/);
  assert.match(globals, /--font-instrument-sans:/);
  assert.match(globals, /--font-geist-mono:/);
  assert.match(config, /turbopack:\s*\{/);
  assert.match(config, /root:/);
});

test("marketing settings fall back safely when DATABASE_URL is absent during local build", async () => {
  const source = await readFile(new URL("../src/lib/marketing/queries.ts", import.meta.url), "utf8");

  assert.match(source, /if \(!process\.env\.DATABASE_URL\) return EMPTY/);
});

test("public testimonials fall back safely when DATABASE_URL is absent during local build", async () => {
  const source = await readFile(new URL("../src/lib/testimonials/queries.ts", import.meta.url), "utf8");

  assert.match(source, /if \(!process\.env\.DATABASE_URL\) return \[\]/);
});
