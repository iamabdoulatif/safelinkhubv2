# English SaaS and Captive Portals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a complete English system UI for SafeLinkHub’s authenticated SaaS, authentication flow, hosted payment pages, and MikroTik captive portal journey while retaining French as the safe default.

**Architecture:** Keep one business implementation and introduce typed dictionaries by bounded UI domain. Public/auth pages resolve locale from their French or English URL, the authenticated dashboard resolves a validated preference cookie, and captive portal pages resolve a validated lang query parameter that survives every cross-device and cross-window redirect. API routes return stable error codes plus their legacy French fallback while UI maps codes to the selected dictionary.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Server/Client Components, next/headers cookies, Drizzle, Node test runner via tsx --test, MikroTik captive-template compiler.

---

## File structure and boundaries

| Unit | Responsibility |
| --- | --- |
| src/lib/i18n/config.ts | Closed locale validation, URL prefixes, formatting locale and portal helpers |
| src/lib/i18n/admin/* | Typed admin catalog and server-only resolver |
| src/lib/i18n/auth/* | Typed labels and validation messages for shared auth forms |
| src/lib/i18n/portal/* | Typed hosted-portal copy, error-code messages and language control labels |
| src/app/en/auth/** | English wrappers which reuse French-auth business components |
| src/app/admin/** | One service layer; pages resolve dictionaries and client children receive serializable text props |
| src/app/portal/** | Validated lang parsing, propagation and localized hosted purchase lifecycle |
| src/lib/captive-templates/package-files.ts | Language selector and lang propagation in MikroTik template links |
| src/app/api/portal/** | Error code compatibility and language-preserving redirect URLs |

The existing uncommitted admin i18n foundation is the starting point: preserve it, extend it, and never reset, checkout, stash, or replace it with an older version.

### Task 1: Establish locale and dictionary safety contracts

**Files:**
- Modify: src/lib/i18n/config.ts
- Modify: src/lib/i18n/server.ts
- Modify: src/lib/i18n/actions.ts
- Create: src/lib/i18n/portal/locale.ts
- Create: test/i18n-locale-contract.test.mjs
- Create: test/i18n-admin-parity.test.mjs

- [ ] **Step 1: Write failing contracts**

~~~js
test("portal locale validates fr/en and retains language in a URL", async () => {
  const { portalLocale, withPortalLocale } = await import("../src/lib/i18n/portal/locale.ts");
  assert.equal(portalLocale("en"), "en");
  assert.equal(portalLocale("EN"), "fr");
  assert.equal(withPortalLocale("/portal/pay?orderId=o1", "en"), "/portal/pay?orderId=o1&lang=en");
});
~~~

Add a recursive shape helper which asserts that adminFr and adminEn have exactly the same leaves and interpolation arities.

- [ ] **Step 2: Run the contracts and verify the red state**

Run: npx tsx --test test/i18n-locale-contract.test.mjs test/i18n-admin-parity.test.mjs  
Expected: failure because portalLocale, withPortalLocale and complete admin catalog parity do not yet exist.

- [ ] **Step 3: Implement only validated, shared primitives**

~~~ts
import { DEFAULT_LOCALE, isLocale, type Locale } from "../config";

export function portalLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export function withPortalLocale(path: string, locale: Locale): string {
  const url = new URL(path, "https://portal.invalid");
  url.searchParams.set("lang", locale);
  return url.pathname + url.search;
}
~~~

Keep the slh_lang cookie at root path, SameSite=Lax, one-year duration and non-httpOnly. The locale action must continue rejecting a forged value before writing the cookie.

- [ ] **Step 4: Verify the green state**

Run: npx tsx --test test/i18n-locale-contract.test.mjs test/i18n-admin-parity.test.mjs && npm run typecheck  
Expected: passing locale/parity tests and zero TypeScript errors.

- [ ] **Step 5: Commit**

~~~bash
git add src/lib/i18n/config.ts src/lib/i18n/server.ts src/lib/i18n/actions.ts src/lib/i18n/portal/locale.ts test/i18n-locale-contract.test.mjs test/i18n-admin-parity.test.mjs
git commit -m "feat(i18n): add validated locale contracts"
~~~

### Task 2: Finish admin shell, dashboard and typed catalog foundation

**Files:**
- Modify: src/lib/i18n/admin/fr.ts
- Modify: src/lib/i18n/admin/en.ts
- Modify: src/lib/i18n/admin/index.ts
- Modify: src/app/admin/layout.tsx
- Modify: src/app/admin/page.tsx
- Modify: src/app/admin/DashboardView.tsx
- Modify: src/components/AdminSidebar.tsx
- Modify: test/landing-nav-slate.test.mjs

- [ ] **Step 1: Add a failing serialization boundary assertion**

~~~js
const layout = await read("src/app/admin/layout.tsx");
assert.match(layout, /const \{ pendingBadge, \.\.\.nav \} = dict\.nav/);
assert.doesNotMatch(layout, /nav=\{dict\.nav\}/);
~~~

- [ ] **Step 2: Run it and verify it fails until the server strips functions**

Run: npx tsx --test test/i18n-admin-parity.test.mjs  
Expected: failure if any function-bearing dictionary object crosses to AdminSidebar.

- [ ] **Step 3: Complete the existing implementation rather than replacing it**

Use adminFr as the reference type and adminEn typed as AdminDictionary. Keep navigation keyed by stable keys. Resolve pendingBadge on the server and pass only nav, language, locale and a precomputed pendingLabel to the client sidebar.

~~~tsx
const [locale, dict] = await Promise.all([getLocale(), getAdminDict()]);
const { pendingBadge, ...nav } = dict.nav;
<AdminSidebar nav={nav} language={dict.language} locale={locale}
  pendingLabel={pendingAuthorizations ? pendingBadge(pendingAuthorizations) : undefined} />
~~~

DashboardView stays database-free, receives its dashboard slice and uses HTML_LANG[locale] for dates and FCFA grouping.

- [ ] **Step 4: Verify shell behavior and formatting**

Run: npx tsx --test test/i18n-admin-parity.test.mjs test/landing-nav-slate.test.mjs && npm run typecheck  
Expected: English catalog parity passes; formatting differs by locale but continues to append FCFA.

- [ ] **Step 5: Commit**

~~~bash
git add src/lib/i18n/admin src/app/admin/layout.tsx src/app/admin/page.tsx src/app/admin/DashboardView.tsx src/components/AdminSidebar.tsx test/i18n-admin-parity.test.mjs test/landing-nav-slate.test.mjs
git commit -m "feat(admin): localize shell and dashboard"
~~~

### Task 3: Translate every network and roaming surface

**Files:**
- Modify: src/app/admin/agent/AddAgentModal.tsx
- Modify: src/app/admin/agent/AgentList.tsx
- Modify: src/app/admin/agent/page.tsx
- Modify: src/app/admin/mikhmon-online/MikhmonOnlineList.tsx
- Modify: src/app/admin/mikhmon-online/page.tsx
- Modify: src/app/admin/remote-access/BackToHomeSection.tsx
- Modify: src/app/admin/remote-access/DirectAccessSection.tsx
- Modify: src/app/admin/remote-access/GenerateOpenvpnScriptForm.tsx
- Modify: src/app/admin/remote-access/Ipv6BypassSection.tsx
- Modify: src/app/admin/remote-access/MndpRelaySection.tsx
- Modify: src/app/admin/remote-access/RemoteAccessControlCenter.tsx
- Modify: src/app/admin/remote-access/RemoteAccessPaywallModal.tsx
- Modify: src/app/admin/remote-access/RemoteAccessTabs.tsx
- Modify: src/app/admin/remote-access/RemoteAccessTunnelDialog.tsx
- Modify: src/app/admin/remote-access/RouterReplacementSection.tsx
- Modify: src/app/admin/remote-access/TemporaryAccessPasses.tsx
- Modify: src/app/admin/remote-access/page.tsx
- Modify: src/app/admin/roaming/RoamingConsole.tsx
- Modify: src/app/admin/roaming/page.tsx
- Modify: src/app/admin/router/ClientPortfolioGrid.tsx
- Modify: src/app/admin/router/HotspotIpv6Button.tsx
- Modify: src/app/admin/router/RefreshButton.tsx
- Modify: src/app/admin/router/RouterPortfolioTabs.tsx
- Modify: src/app/admin/router/RouterRowActions.tsx
- Modify: src/app/admin/router/RoutersTable.tsx
- Modify: src/app/admin/router/SyncAllButton.tsx
- Modify: src/app/admin/router/UnbindMacTicketsButton.tsx
- Modify: src/app/admin/router/[id]/AuditPanel.tsx
- Modify: src/app/admin/router/[id]/HeaderActions.tsx
- Modify: src/app/admin/router/[id]/NetworkGuide.tsx
- Modify: src/app/admin/router/[id]/ResourcesPanel.tsx
- Modify: src/app/admin/router/[id]/RouterDetailTabs.tsx
- Modify: src/app/admin/router/[id]/SerialLockPanel.tsx
- Modify: src/app/admin/router/[id]/ServicesWizard.tsx
- Modify: src/app/admin/router/[id]/TicketDiagnosisPanel.tsx
- Modify: src/app/admin/router/[id]/page.tsx
- Modify: src/app/admin/router/backups/BackupsManager.tsx
- Modify: src/app/admin/router/backups/RestoreGuide.tsx
- Modify: src/app/admin/router/backups/UploadedBackupsCard.tsx
- Modify: src/app/admin/router/backups/page.tsx
- Modify: src/app/admin/router/page.tsx
- Modify: src/app/admin/usage-analytics/page.tsx
- Modify: src/lib/i18n/admin/fr.ts
- Modify: src/lib/i18n/admin/en.ts
- Test: src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx
- Test: src/app/admin/router/RoutersTable.test.tsx
- Create: test/i18n-admin-network.test.mjs

- [ ] **Step 1: Write the failing network catalog test**

~~~js
const { adminEn } = await import("../src/lib/i18n/admin/en.ts");
for (const key of ["routers", "remoteAccess", "roaming", "backups", "diagnostics"]) {
  assert.ok(adminEn.network[key], "missing network." + key);
}
~~~

- [ ] **Step 2: Run it and verify it fails**

Run: npx tsx --test test/i18n-admin-network.test.mjs  
Expected: failure until all five network catalog slices exist.

- [ ] **Step 3: Add typed slices and pass the smallest serializable text object**

Server pages use getAdminDict and getLocale; client modals receive only their labels, help copy, validation messages and accessible text.

~~~tsx
const dict = await getAdminDict();
return <RoamingConsole initialGroups={groups} t={dict.network.roaming} locale={await getLocale()} />;
~~~

Never translate router identities, profile names, VPN endpoints, access codes, RouterOS commands or their output.

- [ ] **Step 4: Add English behavior assertions and run regression tests**

~~~tsx
render(<RoutersTable {...props} t={adminEn.network.routers} locale="en" />);
expect(screen.getByRole("button", { name: "Refresh" })).toBeVisible();
expect(screen.getByText(props.rows[0].identity)).toBeVisible();
~~~

Run: npm test -- src/app/admin/remote-access/RemoteAccessControlCenter.test.tsx src/app/admin/router/RoutersTable.test.tsx test/i18n-admin-network.test.mjs  
Expected: all prior behavior assertions remain green and English labels are visible.

- [ ] **Step 5: Commit**

~~~bash
git add src/app/admin/agent src/app/admin/mikhmon-online src/app/admin/remote-access src/app/admin/roaming src/app/admin/router src/app/admin/usage-analytics src/lib/i18n/admin test/i18n-admin-network.test.mjs
git commit -m "feat(admin): localize network and roaming workflows"
~~~

### Task 4: Translate sales, finance, organization and superadmin surfaces

**Files:**
- Modify: src/app/admin/analytics/PlatformAnalyticsView.tsx
- Modify: src/app/admin/analytics/page.tsx
- Modify: src/app/admin/authorizations/AuthorizationsView.tsx
- Modify: src/app/admin/authorizations/page.tsx
- Modify: src/app/admin/billing/ReferralCard.tsx
- Modify: src/app/admin/billing/SafecoinTopupReturn.tsx
- Modify: src/app/admin/billing/SafecoinWalletCard.tsx
- Modify: src/app/admin/billing/WalletTopupModal.tsx
- Modify: src/app/admin/billing/WalletTopupReturn.tsx
- Modify: src/app/admin/billing/WalletTransactions.tsx
- Modify: src/app/admin/billing/page.tsx
- Modify: src/app/admin/conversion/page.tsx
- Modify: src/app/admin/expenses/AddExpenseModal.tsx
- Modify: src/app/admin/expenses/DeleteExpenseButton.tsx
- Modify: src/app/admin/expenses/page.tsx
- Modify: src/app/admin/float/FloatTransactionModal.tsx
- Modify: src/app/admin/float/page.tsx
- Modify: src/app/admin/packages/CreatePackageModal.tsx
- Modify: src/app/admin/packages/PriceEditor.tsx
- Modify: src/app/admin/packages/StatusToggle.tsx
- Modify: src/app/admin/packages/page.tsx
- Modify: src/app/admin/safecoin/SafecoinActions.tsx
- Modify: src/app/admin/safecoin/SafecoinConsole.tsx
- Modify: src/app/admin/safecoin/page.tsx
- Modify: src/app/admin/sales/page.tsx
- Modify: src/app/admin/transactions/page.tsx
- Modify: src/app/admin/users/OrganizationFocusPanel.tsx
- Modify: src/app/admin/users/UsersControlCenter.tsx
- Modify: src/app/admin/users/UsersDirectoryIndex.tsx
- Modify: src/app/admin/users/UsersRegisterPriority.tsx
- Modify: src/app/admin/users/VpnQuotaForm.tsx
- Modify: src/app/admin/users/page.tsx
- Modify: src/app/admin/vouchers/ArchiveImportedButton.tsx
- Modify: src/app/admin/vouchers/DeleteTicketsModal.tsx
- Modify: src/app/admin/vouchers/DownloadVouchersModal.tsx
- Modify: src/app/admin/vouchers/GenerateVouchersModal.tsx
- Modify: src/app/admin/vouchers/ImportTicketsModal.tsx
- Modify: src/app/admin/vouchers/VoucherTable.tsx
- Modify: src/app/admin/vouchers/page.tsx
- Modify: src/app/admin/vpn-access/VpnAccessVault.tsx
- Modify: src/app/admin/vpn-access/page.tsx
- Modify: src/lib/i18n/admin/fr.ts
- Modify: src/lib/i18n/admin/en.ts
- Create: test/i18n-admin-business.test.mjs

- [ ] **Step 1: Write failing business catalog coverage**

~~~js
const { adminEn } = await import("../src/lib/i18n/admin/en.ts");
for (const key of ["finance", "sales", "users", "tickets", "superadmin"]) {
  assert.ok(adminEn[key], "missing " + key);
}
~~~

- [ ] **Step 2: Run it and verify it fails**

Run: npx tsx --test test/i18n-admin-business.test.mjs  
Expected: failure before all business slices exist.

- [ ] **Step 3: Implement catalog slices and controlled formatting**

Translate system labels, plural text, destructive confirmations, empty states, filters and ARIA labels. Keep FCFA and Safecoin numeric values unchanged and use locale only for grouping.

~~~ts
const money = new Intl.NumberFormat(HTML_LANG[locale]);
const amount = money.format(cents) + " FCFA";
const label = dict.finance.transactionCount(rows.length);
~~~

Never translate user-entered expense descriptions, voucher codes, payment references, organization names or published article bodies.

- [ ] **Step 4: Verify destructive and authorization flows**

Run: npm test -- test/i18n-admin-business.test.mjs src/app/admin/users/UsersControlCenter.test.tsx src/app/admin/users/UsersRegisterPresentation.test.tsx  
Expected: English labels render while original delete, revoke, credit and authorization safeguards are unchanged.

- [ ] **Step 5: Commit**

~~~bash
git add src/app/admin/analytics src/app/admin/authorizations src/app/admin/billing src/app/admin/conversion src/app/admin/expenses src/app/admin/float src/app/admin/packages src/app/admin/safecoin src/app/admin/sales src/app/admin/transactions src/app/admin/users src/app/admin/vouchers src/app/admin/vpn-access src/lib/i18n/admin test/i18n-admin-business.test.mjs
git commit -m "feat(admin): localize business and superadmin workflows"
~~~

### Task 5: Translate profile, settings, support and editorial administration

**Files:**
- Modify: src/app/admin/blog/BlogPostForm.tsx
- Modify: src/app/admin/blog/DeleteBlogPostButton.tsx
- Modify: src/app/admin/blog/ShareStatusPanel.tsx
- Modify: src/app/admin/blog/[id]/page.tsx
- Modify: src/app/admin/blog/new/page.tsx
- Modify: src/app/admin/blog/page.tsx
- Modify: src/app/admin/contact/DeleteContactMessageButton.tsx
- Modify: src/app/admin/contact/page.tsx
- Modify: src/app/admin/marketing/MarketingForm.tsx
- Modify: src/app/admin/marketing/SocialSharingForm.tsx
- Modify: src/app/admin/marketing/page.tsx
- Modify: src/app/admin/profile/ChangePasswordForm.tsx
- Modify: src/app/admin/profile/MfaSection.tsx
- Modify: src/app/admin/profile/ProfileNameForm.tsx
- Modify: src/app/admin/profile/page.tsx
- Modify: src/app/admin/settings/SettingsTabs.tsx
- Modify: src/app/admin/settings/advanced/DangerZone.tsx
- Modify: src/app/admin/settings/advanced/RenameOrgForm.tsx
- Modify: src/app/admin/settings/advanced/page.tsx
- Modify: src/app/admin/settings/captive-templates/BridgeAssignments.tsx
- Modify: src/app/admin/settings/captive-templates/CaptivePreview.tsx
- Modify: src/app/admin/settings/captive-templates/DefaultPortals.tsx
- Modify: src/app/admin/settings/captive-templates/ImportPortalButton.tsx
- Modify: src/app/admin/settings/captive-templates/InstallOnRouter.tsx
- Modify: src/app/admin/settings/captive-templates/MockPaymentModal.tsx
- Modify: src/app/admin/settings/captive-templates/PackageBrandingEditor.tsx
- Modify: src/app/admin/settings/captive-templates/PackagePreview.tsx
- Modify: src/app/admin/settings/captive-templates/TemplateEditor.tsx
- Modify: src/app/admin/settings/captive-templates/TemplatesManager.tsx
- Modify: src/app/admin/settings/captive-templates/ThemeGallery.tsx
- Modify: src/app/admin/settings/captive-templates/page.tsx
- Modify: src/app/admin/settings/payment-gateways/ChannelPicker.tsx
- Modify: src/app/admin/settings/payment-gateways/GatewayCard.tsx
- Modify: src/app/admin/settings/payment-gateways/page.tsx
- Modify: src/app/admin/settings/router-setup/AutoSetupPaywallModal.tsx
- Modify: src/app/admin/settings/router-setup/AutoSetupStep.tsx
- Modify: src/app/admin/settings/router-setup/BootstrapModal.tsx
- Modify: src/app/admin/settings/router-setup/ConfigAuditBanner.tsx
- Modify: src/app/admin/settings/router-setup/ConnectRouterForm.tsx
- Modify: src/app/admin/settings/router-setup/DetectedModelBadge.tsx
- Modify: src/app/admin/settings/router-setup/GenerateScriptForm.tsx
- Modify: src/app/admin/settings/router-setup/LabelScanButton.tsx
- Modify: src/app/admin/settings/router-setup/MethodTabs.tsx
- Modify: src/app/admin/settings/router-setup/RouterResetButton.tsx
- Modify: src/app/admin/settings/router-setup/RouterSetupWizard.tsx
- Modify: src/app/admin/settings/router-setup/StepIndicator.tsx
- Modify: src/app/admin/settings/router-setup/TargetProfileCard.tsx
- Modify: src/app/admin/settings/router-setup/TopologyBuilder.tsx
- Modify: src/app/admin/settings/router-setup/page.tsx
- Modify: src/app/admin/settings/sms/SmsGatewayCard.tsx
- Modify: src/app/admin/settings/sms/page.tsx
- Modify: src/app/admin/settings/walled-garden/WalledGardenManager.tsx
- Modify: src/app/admin/settings/walled-garden/page.tsx
- Modify: src/app/admin/support/NewTicketForm.tsx
- Modify: src/app/admin/support/page.tsx
- Modify: src/app/admin/testimonials/DeleteTestimonialButton.tsx
- Modify: src/app/admin/testimonials/page.tsx
- Modify: src/lib/i18n/admin/fr.ts
- Modify: src/lib/i18n/admin/en.ts
- Create: test/i18n-admin-settings.test.mjs

- [ ] **Step 1: Write failing settings coverage**

~~~js
const { adminEn } = await import("../src/lib/i18n/admin/en.ts");
for (const key of ["profile", "settings", "portalTemplates", "paymentGateways", "routerSetup", "support"]) {
  assert.ok(adminEn[key], "missing " + key);
}
~~~

- [ ] **Step 2: Run it and verify it fails**

Run: npx tsx --test test/i18n-admin-settings.test.mjs  
Expected: failure before the listed catalog slices exist.

- [ ] **Step 3: Implement localized system controls**

Pass typed dictionary slices from server pages to client forms and modals. Translate validation, status values owned by SafeLinkHub, dialog actions and accessible labels.

~~~tsx
<TemplateEditor template={template} t={dict.portalTemplates.editor} />
<RouterSetupWizard router={router} t={dict.routerSetup} locale={locale} />
~~~

Keep custom portal HTML, custom package descriptions, SMS body inputs and blog/article body content untouched.

- [ ] **Step 4: Run settings and RouterOS safety suites**

Run: npm test -- test/i18n-admin-settings.test.mjs test/portal-payment-delivery.test.mjs test/mikrotik-auto-setup-hardening.test.mjs  
Expected: English catalog tests and existing template, payment and RouterOS safety suites pass.

- [ ] **Step 5: Commit**

~~~bash
git add src/app/admin/blog src/app/admin/contact src/app/admin/marketing src/app/admin/profile src/app/admin/settings src/app/admin/support src/app/admin/testimonials src/lib/i18n/admin test/i18n-admin-settings.test.mjs
git commit -m "feat(admin): localize settings support and content tools"
~~~

### Task 6: Add URL-based English authentication

**Files:**
- Modify: src/lib/i18n/config.ts
- Create: src/lib/i18n/auth/fr.ts
- Create: src/lib/i18n/auth/en.ts
- Create: src/lib/i18n/auth/index.ts
- Modify: src/components/auth/AuthShell.tsx
- Modify: src/app/auth/layout.tsx
- Modify: src/app/auth/login/LoginForm.tsx
- Modify: src/app/auth/login/page.tsx
- Modify: src/app/auth/register/RegisterForm.tsx
- Modify: src/app/auth/register/page.tsx
- Modify: src/app/auth/activation/ActivateForm.tsx
- Modify: src/app/auth/activation/page.tsx
- Modify: src/app/auth/activation-envoyee/page.tsx
- Modify: src/app/auth/mot-de-passe-oublie/ForgotPasswordForm.tsx
- Modify: src/app/auth/mot-de-passe-oublie/page.tsx
- Modify: src/app/auth/reinitialiser/ResetPasswordForm.tsx
- Modify: src/app/auth/reinitialiser/page.tsx
- Create: src/app/en/auth/login/page.tsx
- Create: src/app/en/auth/register/page.tsx
- Create: src/app/en/auth/activation/page.tsx
- Create: src/app/en/auth/activation-envoyee/page.tsx
- Create: src/app/en/auth/mot-de-passe-oublie/page.tsx
- Create: src/app/en/auth/reinitialiser/page.tsx
- Create: test/i18n-auth-routing.test.mjs

- [ ] **Step 1: Write failing route and submission tests**

~~~js
const page = await read("src/app/en/auth/login/page.tsx");
const form = await read("src/app/auth/login/LoginForm.tsx");
assert.match(page, /locale="en"/);
assert.match(form, /name="locale" value=\{locale\}/);
~~~

- [ ] **Step 2: Run it and verify it fails**

Run: npx tsx --test test/i18n-auth-routing.test.mjs  
Expected: failure because English wrappers and hidden locale input do not exist.

- [ ] **Step 3: Extract locale-aware, shared auth composition**

French pages remain the canonical component owners. English pages are thin wrappers that pass locale="en"; forms receive their auth dictionary slice.

~~~tsx
export default function EnglishLoginPage() {
  return <LoginPageContent locale="en" />;
}
<input type="hidden" name="locale" value={locale} />
~~~

Add only concrete implemented auth routes to TRANSLATED_ROUTES. Server actions set slh_lang only after their existing password, activation and callback checks succeed.

- [ ] **Step 4: Verify French/English and callback security**

Run: npm test -- test/i18n-auth-routing.test.mjs test/login-callback-security.test.mjs  
Expected: English routes show English copy, French URLs still work, forged callbacks remain rejected.

- [ ] **Step 5: Commit**

~~~bash
git add src/lib/i18n/auth src/lib/i18n/config.ts src/components/auth src/app/auth src/app/en/auth test/i18n-auth-routing.test.mjs
git commit -m "feat(auth): add English authentication flow"
~~~

### Task 7: Localize hosted captive-portal pages and preserve lang

**Files:**
- Create: src/lib/i18n/portal/fr.ts
- Create: src/lib/i18n/portal/en.ts
- Create: src/lib/i18n/portal/index.ts
- Modify: src/app/portal/purchase/page.tsx
- Modify: src/app/portal/purchase/PurchaseFlow.tsx
- Modify: src/app/portal/pay/page.tsx
- Modify: src/app/portal/pay/PayMethods.tsx
- Modify: src/app/portal/paid/page.tsx
- Modify: src/app/portal/paid/PaidStatus.tsx
- Modify: src/app/portal/recover/page.tsx
- Modify: src/app/portal/recover/RecoverCode.tsx
- Modify: src/lib/portal/theme.ts
- Modify: src/app/portal/purchase/page.test.ts
- Create: test/i18n-portal-hosted.test.mjs

- [ ] **Step 1: Write failing propagation tests**

~~~js
for (const path of [
  "src/app/portal/purchase/page.tsx",
  "src/app/portal/pay/page.tsx",
  "src/app/portal/paid/page.tsx",
  "src/app/portal/recover/page.tsx",
]) {
  assert.match(await read(path), /portalLocale\(params\.lang\)/);
}
~~~

- [ ] **Step 2: Run it and verify it fails**

Run: npx tsx --test test/i18n-portal-hosted.test.mjs  
Expected: failure because hosted pages have no validated lang parameter.

- [ ] **Step 3: Implement typed portal dictionaries and explicit control**

Every hosted page accepts optional lang, resolves it with portalLocale, passes locale and the smallest dictionary slice to its client flow, sets lang on its root, and uses withPortalLocale for back, retry, recover and payment links.

~~~tsx
const locale = portalLocale(params.lang);
const dict = getPortalDict(locale);
return <PurchaseFlow {...purchase} locale={locale} t={dict.purchase} />;
~~~

Client components never use cookies. Theme fields are carried unchanged.

- [ ] **Step 4: Verify English rendering and French fallback**

Run: npm test -- src/app/portal/purchase/page.test.ts test/i18n-portal-hosted.test.mjs test/portal-payment-speed.test.mjs  
Expected: lang=en renders English, invalid/absent lang renders French, original order and theme parameters survive.

- [ ] **Step 5: Commit**

~~~bash
git add src/lib/i18n/portal src/app/portal src/lib/portal/theme.ts test/i18n-portal-hosted.test.mjs
git commit -m "feat(portal): localize hosted purchase journey"
~~~

### Task 8: Add stable portal API errors and language-preserving redirects

**Files:**
- Modify: src/app/api/portal/[slug]/initiate/route.ts
- Modify: src/app/api/portal/[slug]/otp/send/route.ts
- Modify: src/app/api/portal/[slug]/otp/verify/route.ts
- Modify: src/app/api/portal/[slug]/pay/route.ts
- Modify: src/app/api/portal/[slug]/plans/route.ts
- Modify: src/app/api/portal/[slug]/rebuy/route.ts
- Modify: src/app/api/portal/[slug]/recover-code/route.ts
- Modify: src/app/api/portal/[slug]/status/route.ts
- Modify: src/app/api/portal/[slug]/ticket-sms/route.ts
- Create: src/lib/portal/error-codes.ts
- Create: test/i18n-portal-api.test.mjs
- Modify: test/portal-payment-delivery.test.mjs
- Modify: test/portal-payment-speed.test.mjs

- [ ] **Step 1: Write failing API compatibility checks**

~~~js
const source = await read("src/app/api/portal/[slug]/pay/route.ts");
assert.match(source, /errorCode: "PAYMENT_UNAVAILABLE"/);
assert.match(source, /error: "Paiement en ligne non configuré\." /);
~~~

Also assert that initiate uses withPortalLocale when constructing the hosted payment URL.

- [ ] **Step 2: Run it and verify it fails**

Run: npx tsx --test test/i18n-portal-api.test.mjs  
Expected: failure because current routes have human French strings only and omit lang in generated URLs.

- [ ] **Step 3: Implement compatible error codes**

~~~ts
export const PORTAL_ERROR_CODES = [
  "INVALID_LINK", "ORDER_NOT_FOUND", "PAYMENT_UNAVAILABLE",
  "PAYMENT_IN_PROGRESS", "PAYMENT_FAILED", "OTP_INVALID", "RECOVERY_UNAVAILABLE",
] as const;

export function portalError(errorCode, error) {
  return { errorCode, error };
}
~~~

Every existing JSON failure retains its HTTP status and French error fallback while adding the precise errorCode. Parsing lang only affects redirects: it never affects lookup, authorization, payment provider call or fulfillment.

- [ ] **Step 4: Update UI error mapping and run payment regressions**

Run: npm test -- test/i18n-portal-api.test.mjs test/portal-payment-delivery.test.mjs test/portal-payment-speed.test.mjs  
Expected: UI maps errorCode through portal dictionary, unknown old codes fall back to error, and all payment semantics remain unchanged.

- [ ] **Step 5: Commit**

~~~bash
git add src/app/api/portal src/lib/portal/error-codes.ts src/app/portal test/i18n-portal-api.test.mjs test/portal-payment-delivery.test.mjs test/portal-payment-speed.test.mjs
git commit -m "feat(portal): localize API errors and redirects"
~~~

### Task 9: Compile bilingual MikroTik captive portal templates

**Files:**
- Modify: src/lib/captive-templates/package-files.ts
- Modify: src/lib/captive-templates/package-files.test.ts
- Modify: src/lib/captive-templates/default-portals.test.ts
- Modify: src/lib/captive-templates/actions.ts
- Modify: src/app/api/router/v1/[slug]/captive-template/[templateId]/route.ts
- Modify: src/lib/mikrotik/captive-template-upload.ts
- Create: test/i18n-captive-template.test.mjs

- [ ] **Step 1: Write failing compiler contracts**

~~~js
const html = await renderPackageFile(loginTemplate, portalData);
assert.match(html, /data-slh-language-switch/);
assert.match(html, /lang=en/);
assert.match(html, /English/);
assert.match(html, /\/portal\/purchase\?[^"']*lang=/);
assert.match(html, /\/portal\/recover\?[^"']*lang=/);
~~~

- [ ] **Step 2: Run them and verify they fail**

Run: npx tsx --test src/lib/captive-templates/package-files.test.ts test/i18n-captive-template.test.mjs  
Expected: failure because generated templates are French-only and omit the switch marker.

- [ ] **Step 3: Implement a dependency-free bilingual portal controller**

renderPackageFile injects data-slh-language-switch and a small inline controller. It validates language, defaults to French, replaces only SafeLinkHub-owned labels and appends lang to hosted purchase/recovery links. It must not fetch remote resources, rely on cookies, rewrite operator custom content, or alter RouterOS action fields.

~~~html
<button type="button" data-slh-language-switch aria-label="Change language">English</button>
~~~

Keep mac, link-login-only, voucher identifiers and package IDs unchanged.

- [ ] **Step 4: Verify captive templates and auto-setup**

Run: npm test -- src/lib/captive-templates/package-files.test.ts src/lib/captive-templates/default-portals.test.ts test/i18n-captive-template.test.mjs test/mikrotik-auto-setup-hardening.test.mjs  
Expected: bilingual contract passes with unchanged default portal and RouterOS installation behavior.

- [ ] **Step 5: Commit**

~~~bash
git add src/lib/captive-templates src/app/api/router/v1 src/lib/mikrotik/captive-template-upload.ts test/i18n-captive-template.test.mjs
git commit -m "feat(captive): add bilingual portal template journey"
~~~

### Task 10: Complete regression, browser validation and VPS release

**Files:**
- Modify: test/i18n-parity.test.mjs
- Modify: test/landing-mikrotik-hero.test.mjs only if its route assertions need the expanded auth route list
- Modify: docs/superpowers/specs/2026-08-21-english-saas-and-captive-portals-design.md only if a verification contradiction is discovered

- [ ] **Step 1: Add final complete-journey contract**

Assert public English, English auth wrappers, admin language action, portal lang propagation, API error-code compatibility and client/server boundary tests in the i18n suite.

- [ ] **Step 2: Run full local verification**

Run: npm run typecheck && npm run lint && npm test && npm run build  
Expected: zero TypeScript errors, zero test failures and a successful production build. Record any pre-existing lint warning separately and never suppress it as a translation shortcut.

- [ ] **Step 3: Browser-check the compiled build at desktop and mobile widths**

Run: npm run start -- -p 3104  
Verify English copy, no error overlay, no horizontal overflow, language persistence through hosted portal URLs and the four core portal states. Close the server after checking.

- [ ] **Step 4: Commit test completion and push**

~~~bash
git add test/i18n-parity.test.mjs test/landing-mikrotik-hero.test.mjs docs/superpowers/specs/2026-08-21-english-saas-and-captive-portals-design.md
git commit -m "test(i18n): verify complete English SaaS journey"
git push origin main
~~~

- [ ] **Step 5: Wait for VPS deployment and verify public production**

Run: gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId,status,conclusion,url  
Then: gh run watch DATABASE_ID --exit-status  
Expected: verify, Docker build/push and VPS container switch complete successfully.

Run: curl -fsSI https://safelinkhub.io/en && curl -fsSI 'https://safelinkhub.io/portal/purchase?lang=en'  
Expected: both requests return HTTP 200; browser verification confirms English copy and portal language retention.

## Plan self-review

- **Spec coverage:** Tasks 1–5 cover the typed locale model and authenticated SaaS, Task 6 covers URL-based authentication, Tasks 7–9 cover hosted and MikroTik-served captive journeys, Task 8 preserves API compatibility, and Task 10 verifies/deploys the result.
- **No ambiguity:** French is the default for a missing or invalid portal language; user-authored content is not auto-translated; portal URLs carry lang while admin uses only a validated preference cookie.
- **Type consistency:** Locale, portalLocale, withPortalLocale, AdminDictionary, errorCode and error retain the same names across all tasks.
- **Safety:** Localization changes text and validated URLs only. Scope, authorization, RouterOS credentials, transactions and payment fulfillment remain covered by their existing regression suites.

