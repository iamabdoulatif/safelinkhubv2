import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  installTokenHash: text("install_token_hash"),
  installTokenExpiresAt: timestamp("install_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentGateways = pgTable("payment_gateways", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // "wave" | "orange_money" | "moov_money"
  merchantId: text("merchant_id"),
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
});
