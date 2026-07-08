import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Flips true the first time ANY router for this org completes the
  // auto-setup wizard — tracked at the org level (not just on the router
  // row) so the free trial can't be re-claimed by deleting and re-adding a
  // router. See lib/billing/auto-setup-pricing.ts.
  freeRouterSetupUsed: boolean("free_router_setup_used").notNull().default(false),
  // One-off, time-boxed exception granted to a specific org (e.g. a
  // second free router for a year) — distinct from the superadmin role
  // (lib/auth/session.ts), which is permanent and tied to a user account
  // rather than one org. Null means no bonus credit. Deleting and
  // re-adding a router doesn't burn it, same as the regular free-trial
  // flag above — it's date-bound, not a one-time-use flag.
  bonusFreeRouterUntil: timestamp("bonus_free_router_until"),
  // Superadmin-controlled VPN billing override for the SaaS org. "default"
  // keeps the normal trial/wallet behavior, "free_until" and "unlimited"
  // grant free direct-access VPN, and "paid" forces wallet billing even if
  // the default trial would still be active.
  vpnQuotaMode: text("vpn_quota_mode").notNull().default("default"),
  vpnQuotaExpiresAt: timestamp("vpn_quota_expires_at"),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // TOTP secret, AES-256-GCM encrypted at rest with the same AUTH_SECRET-
  // derived key used for router credentials (lib/mikrotik/crypto.ts) — null
  // until enrollment is confirmed with a valid code (see lib/auth/mfa.ts).
  mfaSecretEncrypted: text("mfa_secret_encrypted"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  // JSON array of bcrypt hashes, one per unused recovery code. Each is
  // removed from the array the moment it's redeemed (single use).
  mfaBackupCodesHash: text("mfa_backup_codes_hash"),
  // Contact info collected at registration (see lib/intl/countries.ts for
  // the country/dial-code list). Nullable only because accounts created
  // before this field existed have no value — the register form requires
  // it for new sign-ups.
  // Email verification / account activation. Existing accounts predate this
  // feature and are backfilled to true by the migration so they're never
  // locked out; new sign-ups start false and must click the activation link
  // (lib/auth/tokens.ts + email.ts) before login is granted. The token is
  // stored SHA-256-hashed, same pattern as the router install tokens above.
  emailVerified: boolean("email_verified").notNull().default(false),
  activationTokenHash: text("activation_token_hash"),
  activationTokenExpiresAt: timestamp("activation_token_expires_at"),
  // "Mot de passe oublié" flow — a short-lived (1 h) single-use token, again
  // stored only as its SHA-256 hash. Cleared the moment it's redeemed.
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetTokenExpiresAt: timestamp("password_reset_token_expires_at"),
  country: text("country"),
  phoneDialCode: text("phone_dial_code"),
  phone: text("phone"),
  // Null means "same as phone" — resolved at read time, not defaulted at
  // write time, so changing the phone number later doesn't silently
  // overwrite a WhatsApp/Telegram number the user deliberately customized.
  whatsapp: text("whatsapp"),
  telegram: text("telegram"),
});

// Every login attempt (success or failure), kept just long enough to
// compute the rate-limit windows in lib/auth/rate-limit.ts. Not a full
// audit log — rows older than the longest window are pruned on insert.
export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  ipAddress: text("ip_address").notNull(),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routers = pgTable("routers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  model: text("model"),
  host: text("host"),
  apiPort: integer("api_port").default(8728),
  username: text("username"),
  passwordEncrypted: text("password_encrypted"),
  status: text("status").notNull().default("offline"),
  lastSyncAt: timestamp("last_sync_at"),
  uptimeSeconds: integer("uptime_seconds").default(0),
  activeUsers: integer("active_users").default(0),
  cpuLoad: integer("cpu_load").default(0),
  memoryUsage: numeric("memory_usage", { precision: 5, scale: 2 }).default(
    "0",
  ),
  connectionMethod: text("connection_method").notNull().default("direct"),
  tunnelIp: text("tunnel_ip"),
  wgPeerPublicKey: text("wg_peer_public_key"),
  // Relay shard ("s1".."s4") this router's direct-access URLs + port pool are
  // bound to — assigned round-robin once at creation, immutable after. Only
  // takes visible effect once sharding is enabled (RELAY_BASE_DOMAIN set,
  // Phase 3 cutover). See lib/mikrotik/shards.ts + the relay-sharding spec.
  relayShard: text("relay_shard"),
  // "Bypass IPv6": when true, the router routes its hotspot clients' Internet
  // traffic into the existing SafeLinkHub WireGuard tunnel so it exits via the
  // VPS-relay's public IPv4 (exit-node / full-tunnel mode for FAI IPv6/CGNAT/
  // DS-Lite). Toggled per router from the remote-access page — see
  // lib/mikrotik/ipv6-bypass.ts. Only meaningful when connectionMethod="vpn".
  ipv6BypassEnabled: boolean("ipv6_bypass_enabled").notNull().default(false),
  ipv6BypassEnabledAt: timestamp("ipv6_bypass_enabled_at"),
  installTokenHash: text("install_token_hash"),
  installTokenExpiresAt: timestamp("install_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // True once this specific router has consumed either the org's one free
  // auto-setup trial or a paid auto-setup charge — re-running the wizard
  // on an already-billed router never charges again. See
  // lib/billing/auto-setup-pricing.ts.
  autoSetupBilled: boolean("auto_setup_billed").notNull().default(false),
  // Operator-chosen names for the RouterOS bridge/hotspot server the
  // auto-setup creates — default to HOTSPOT_BRIDGE_NAME/"hotspot1" (see
  // constants.ts) when null, but letting them be renamed means other code
  // paths that look up this router's live hotspot config (the connection
  // test, captive-template assignment) must read these back rather than
  // assuming the fixed default name.
  hotspotBridgeName: text("hotspot_bridge_name"),
  hotspotServerName: text("hotspot_server_name"),
  // Snapshot of the HotspotStackOptions a successful provisionHotspotStack
  // run was last called with (container-setup.ts) — every field the
  // wizard's steps collect (hotspotAddress, hotspotName, dnsName, ssid,
  // voucher profiles, etc.), minus the boolean-flag fields that should
  // always be re-evaluated fresh (reboot). Lets "Continuer l'auto-setup"
  // (config-audit.ts's repair action) replay the exact same run against
  // whatever's missing on the router, without the admin re-typing every
  // field from the original wizard pass.
  lastAutoSetupConfig: jsonb("last_auto_setup_config"),
});

export const captiveTemplates = pgTable("captive_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  logoUrl: text("logo_url"),
  backgroundUrl: text("background_url"),
  primaryColor: text("primary_color").notNull().default("#0f172a"),
  backgroundColor: text("background_color").notNull().default("#f8fafc"),
  title: text("title").notNull().default("Bienvenue sur le réseau Wi-Fi"),
  subtitle: text("subtitle")
    .notNull()
    .default("Entrez votre code d'accès pour vous connecter."),
  buttonLabel: text("button_label").notNull().default("Se connecter"),
  voucherFieldLabel: text("voucher_field_label").notNull().default("Code d'accès"),
  termsText: text("terms_text"),
  footerText: text("footer_text"),
  mobileMoneyEnabled: boolean("mobile_money_enabled").notNull().default(false),
  // "parametric" (logo/colors/labels generated into a single page) or
  // "package" (a full multi-file HTML/CSS/JS/image hotspot portal, stored
  // verbatim in packageFiles and uploaded file-by-file to the router's
  // html-directory via /tool/fetch — see captive-template-upload.ts).
  templateType: text("template_type").notNull().default("parametric"),
  // Array of { path, content, encoding: "utf8" | "base64" }. Text files
  // (html/css/js) carry a {{SSID}} placeholder substituted at fetch time
  // with the router's live WiFi SSID — see package-files.ts.
  packageFiles: jsonb("package_files"),
  // Configurable branding for "package" templates, substituted into the
  // {{SUPPORT_LINKS_HTML}} / {{VENDORS_HTML}} placeholders at fetch time
  // — see package-files.ts.
  packageSupportWhatsapp: text("package_support_whatsapp"),
  packageSupportPhone: text("package_support_phone"),
  packageVendors: jsonb("package_vendors"), // Array of { name, location, phone }
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentGateways = pgTable("payment_gateways", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // "paystack" | "genius_pay" | "pawapay" (see PROVIDERS in lib/payment-gateways/providers.ts)
  merchantId: text("merchant_id"),
  apiKeyEncrypted: text("api_key_encrypted"),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const smsGateways = pgTable("sms_gateways", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // "africastalking" | "twilio" (see PROVIDERS in lib/sms/providers.ts)
  senderId: text("sender_id"), // AT "username"/short code, or Twilio "from" number
  apiKeyEncrypted: text("api_key_encrypted"),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bridges = pgTable("bridges", {
  id: uuid("id").primaryKey().defaultRandom(),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  gatewayIp: text("gateway_ip").notNull(),
  subnetBits: integer("subnet_bits").notNull().default(24),
  ports: text("ports").array().notNull().default([]),
  hotspotEnabled: boolean("hotspot_enabled").notNull().default(true),
  preventSharing: boolean("prevent_sharing").notNull().default(true),
  pppoeEnabled: boolean("pppoe_enabled").notNull().default(false),
  bootstrapStatus: text("bootstrap_status").notNull().default("none"),
  bootstrapTokenHash: text("bootstrap_token_hash"),
  bootstrapTokenExpiresAt: timestamp("bootstrap_token_expires_at"),
  captiveTemplateId: uuid("captive_template_id").references(() => captiveTemplates.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  durationValue: integer("duration_value").notNull(),
  durationUnit: text("duration_unit").notNull().default("Hours"),
  uploadMbps: integer("upload_mbps").notNull().default(5),
  downloadMbps: integer("download_mbps").notNull().default(5),
  commissionCents: integer("commission_cents").notNull().default(0),
  billingStartsOn: text("billing_starts_on").notNull().default("Upon First Use"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  packageId: uuid("package_id").references(() => packages.id, {
    onDelete: "set null",
  }),
  // Set when a sale is made through the Agent / POS flow — lets each
  // agent's cash sales and commission be tracked separately from batch-
  // generated vouchers (which have no agent).
  agentId: uuid("agent_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("PROVISIONED"),
  firstLoginAt: timestamp("first_login_at"),
  expiresAt: timestamp("expires_at"),
  useCase: text("use_case").notNull().default("Batch Create"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const personalVpnAccess = pgTable("personal_vpn_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  method: text("method").notNull(), // "wireguard" | "openvpn"
  username: text("username"), // openvpn only; also doubles as the relay peer name
  passwordEncrypted: text("password_encrypted"), // openvpn only
  peerPublicKey: text("peer_public_key"), // wireguard only, needed to revoke
  vpnIp: text("vpn_ip"),
  remoteHost: text("remote_host").notNull(),
  remotePort: integer("remote_port").notNull(),
  displayPort: integer("display_port"), // cosmetic port shown in the UI/comment, e.g. mimicking a per-peer reverse-proxy port
  status: text("status").notNull().default("active"), // active | revoked
  autoRenew: boolean("auto_renew").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
});

export const floatTransactions = pgTable("float_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "deposit" | "withdrawal"
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  expenseDate: timestamp("expense_date").defaultNow().notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routerPortForwards = pgTable("router_port_forwards", {
  id: uuid("id").primaryKey().defaultRandom(),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  service: text("service").notNull(), // "winbox" | "webfig" | "ssh"
  targetPort: integer("target_port").notNull(),
  publicPort: integer("public_port").notNull().unique(),
  tunnelIp: text("tunnel_ip").notNull(),
  status: text("status").notNull().default("active"), // active | revoked
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  // Billing plan chosen when the admin activated this access — recorded
  // now so the UI can show "expires on" and a renewal flow, even though
  // payment enforcement isn't wired up yet (every plan is free for now,
  // see PLAN comment in port-forward.ts).
  billingPeriod: text("billing_period").notNull().default("monthly"), // "monthly" | "quarterly" | "semiannual" | "yearly" (1/3/6/12 months — see BillingPeriod in port-forward.ts)
  expiresAt: timestamp("expires_at"),
});

/**
 * Org-level prepaid wallet that direct-access (WinBox/WebFig/SSH/MikHmon)
 * plan activations charge against — separate from floatTransactions, which
 * tracks the org's own mobile-money float for selling hotspot vouchers to
 * their customers, a completely different cash flow. Balance is derived
 * by summing "topup" minus "charge" rows rather than stored denormalized,
 * same pattern as floatTransactions.
 */
export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "topup" | "charge"
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  // Which direct-access activation this charge was for, if any — null for
  // manual top-ups. set null (not cascade) so the ledger entry survives
  // even after the forward itself is later disabled/deleted.
  relatedForwardId: uuid("related_forward_id").references(() => routerPortForwards.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Articles du blog public du SaaS — gérés exclusivement par le rôle
 * superadmin (lib/auth/session.ts), d'où l'absence d'orgId contrairement
 * aux autres tables : le blog appartient à la plateforme, pas à une
 * organisation cliente. Seuls les articles published=true sont visibles
 * sur /blog.
 */
export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  // Catégorie / sujet de l'article (texte libre saisi par le superadmin) —
  // alimente la sidebar de filtres du blog public. Null = "non classé".
  category: text("category"),
  // Chemin public (/blog/xxx.svg) ou URL absolue de l'illustration de
  // couverture — affichée sur la liste /blog et en tête d'article.
  coverImageUrl: text("cover_image_url"),
  published: boolean("published").notNull().default(false),
  // Fixée à la première publication et conservée ensuite — dépublier puis
  // republier ne remonte pas artificiellement l'article en tête de liste.
  publishedAt: timestamp("published_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Messages envoyés depuis le formulaire public /contact — les expéditeurs
 * sont des visiteurs anonymes (pas de orgId ni userId). Consultés et
 * triés par le superadmin dans /admin/contact.
 */
export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"), // new | read | archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | resolved
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// TEMPORAIRE — porte de monétisation manuelle de l'Auto-Setup, en attendant
// le module de paiement intégré. Un utilisateur (hors superadmin) qui veut
// lancer un auto-setup paie hors-app (Wave/OM/Moov/MTN), soumet une demande
// avec sa preuve, et le superadmin la valide. Une demande "approved" non
// encore "consumedAt" débloque UN lancement d'auto-setup sur le routeur ciblé.
// TODO: Remplacer par système de paiement intégré (webhook agrégateur).
export const autoSetupAuthorizations = pgTable("auto_setup_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Demandeur (snapshot email/nom pour l'affichage superadmin même si le
  // compte change ensuite).
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  requesterEmail: text("requester_email").notNull(),
  requesterName: text("requester_name").notNull(),
  // Routeur ciblé — l'autorisation ne débloque que celui-ci.
  routerId: uuid("router_id").references(() => routers.id, { onDelete: "cascade" }),
  routerName: text("router_name"),
  // Type de MikroTik : détermine le tarif (avec/sans container).
  supportsContainers: boolean("supports_containers").notNull(),
  // Montant déclaré par l'utilisateur, en FCFA (XOF n'a pas de sous-unité).
  amountFcfa: integer("amount_fcfa").notNull(),
  paymentMethod: text("payment_method").notNull(), // wave | orange | moov | mtn
  proofUrl: text("proof_url"), // capture de paiement (Vercel Blob)
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  // Posé quand un auto-setup réussi consomme une autorisation approuvée.
  consumedAt: timestamp("consumed_at"),
  decidedAt: timestamp("decided_at"),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// TEMPORAIRE — même porte de monétisation manuelle, mais pour l'activation
// des accès distants (WinBox/WebFig/SSH/MikHmon) par service et par durée.
// Une demande "approved" non consommée débloque UNE activation du forward
// (service + période) sur le routeur ciblé. Le paiement remplace la
// facturation wallet pour les non-superadmins.
// TODO: Remplacer par système de paiement intégré.
export const remoteAccessAuthorizations = pgTable("remote_access_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  requesterEmail: text("requester_email").notNull(),
  requesterName: text("requester_name").notNull(),
  routerId: uuid("router_id").references(() => routers.id, { onDelete: "cascade" }),
  routerName: text("router_name"),
  // Service demandé : winbox | webfig | ssh | mikhmon.
  service: text("service").notNull(),
  // Durée demandée : monthly | quarterly | semiannual | yearly.
  billingPeriod: text("billing_period").notNull(),
  amountFcfa: integer("amount_fcfa").notNull(),
  paymentMethod: text("payment_method").notNull(), // wave | orange | moov | mtn
  proofUrl: text("proof_url"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  consumedAt: timestamp("consumed_at"),
  decidedAt: timestamp("decided_at"),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// TEMPORAIRE — porte d'autorisation manuelle générique pour les
// fonctionnalités encore gratuites (pas de paiement intégré) : lier un
// MikroTik ("router_link") et créer un tunnel d'accès distant WireGuard/
// OpenVPN ("remote_access"). L'utilisateur envoie une demande (sans preuve de
// paiement), le superadmin est notifié (email + in-app + WhatsApp) et
// approuve. Une demande "approved" non "consumedAt" débloque UNE utilisation
// de la fonctionnalité ciblée. Distinct des tables autoSetup/remoteAccess
// (celles-ci portent un montant/preuve de paiement).
// TODO: Remplacer par système de paiement intégré.
export const featureAccessAuthorizations = pgTable("feature_access_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  requesterEmail: text("requester_email").notNull(),
  requesterName: text("requester_name").notNull(),
  // "router_link" (lier un MikroTik) | "remote_access" (tunnel WireGuard/OpenVPN)
  feature: text("feature").notNull(),
  // Message libre facultatif joint par le demandeur.
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  // Posé quand l'utilisateur consomme l'autorisation (1 demande = 1 usage).
  consumedAt: timestamp("consumed_at"),
  decidedAt: timestamp("decided_at"),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Boutique e-commerce gérée par le superadmin : vente d'équipement
// technologique (routeurs, antennes, accessoires…) aux opérateurs. Le
// superadmin gère le catalogue (CRUD + image) ; les admins parcourent et
// commandent via WhatsApp (pas de paiement intégré pour l'instant).
// Réglages marketing globaux de la plateforme (pixels & analytics), gérés
// exclusivement par le superadmin — d'où l'absence d'orgId, comme le blog :
// ces tags concernent le site public (landing + blog + boutique), pas une
// organisation cliente. Une seule ligne en pratique (singleton). Les valeurs
// sont injectées dans le <head> du site via components/analytics.
export const marketingSettings = pgTable("marketing_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  metaPixelId: text("meta_pixel_id"),
  ga4MeasurementId: text("ga4_measurement_id"),
  gtmId: text("gtm_id"),
  tiktokPixelId: text("tiktok_pixel_id"),
  // AdSense : client "ca-pub-…" + éventuel slot d'unité manuelle pour le blog.
  adsenseClientId: text("adsense_client_id"),
  adsenseSlotId: text("adsense_slot_id"),
  // Interrupteur d'affichage des pubs sur le blog (le script reste chargé si
  // le client est renseigné, mais aucune unité n'est rendue si désactivé).
  adsenseEnabled: boolean("adsense_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Catégories de la boutique — gérées par le superadmin (ajout / renommage /
// suppression). Référencées par leur libellé texte depuis products.category
// (pas de clé étrangère : supprimer une catégorie ne casse pas les produits,
// on remet simplement leur category à null — voir deleteCategory dans
// lib/shop/actions.ts). `position` ordonne la sidebar du catalogue.
export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Identifiant lisible pour l'URL de la fiche produit (/boutique/<slug>).
  // Nullable + unique : Postgres autorise plusieurs NULL, les lignes
  // héritées sont backfillées par la migration.
  slug: text("slug").unique(),
  description: text("description"),
  // Prix en FCFA (XOF n'a pas de sous-unité).
  priceFcfa: integer("price_fcfa").notNull(),
  // Stock disponible.
  stockQuantity: integer("stock_quantity").notNull().default(0),
  imageUrl: text("image_url"),
  // Galerie : images supplémentaires (URLs) affichées sur la fiche produit,
  // en plus de imageUrl (image principale).
  images: jsonb("images").$type<string[]>().notNull().default([]),
  // Modèle 3D optionnel (URL .glb/.gltf) — affiché en visualiseur interactif
  // (rotation auto, orbite, zoom) sur la fiche produit via three.js.
  model3dUrl: text("model_3d_url"),
  // Couleurs proposées (tableau de libellés), choisies à la commande.
  colors: jsonb("colors").$type<string[]>().notNull().default([]),
  // Badges marketing configurables par le superadmin (ids du BADGE_CATALOG :
  // promo | bestseller | fast_shipping | warranty). Les badges "Nouveau" et
  // "Stock faible" restent dérivés automatiquement (product-status.ts).
  badges: jsonb("badges").$type<string[]>().notNull().default([]),
  // Caractéristiques techniques : liste de paires libellé/valeur.
  specs: jsonb("specs").$type<{ label: string; value: string }[]>().notNull().default([]),
  category: text("category"), // Routeurs | Antennes | Accessoires | …
  brand: text("brand"),
  // active = visible au catalogue ; hidden = masqué.
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
