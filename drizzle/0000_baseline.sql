CREATE TABLE "auto_setup_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"requester_email" text NOT NULL,
	"requester_name" text NOT NULL,
	"router_id" uuid,
	"router_name" text,
	"supports_containers" boolean NOT NULL,
	"amount_fcfa" integer NOT NULL,
	"payment_method" text NOT NULL,
	"proof_url" text,
	"payment_reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"consumed_at" timestamp,
	"decided_at" timestamp,
	"decided_by" uuid,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_post_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"external_url" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"category" text,
	"cover_image_url" text,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bridges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gateway_ip" text NOT NULL,
	"subnet_bits" integer DEFAULT 24 NOT NULL,
	"ports" text[] DEFAULT '{}' NOT NULL,
	"hotspot_enabled" boolean DEFAULT true NOT NULL,
	"prevent_sharing" boolean DEFAULT true NOT NULL,
	"pppoe_enabled" boolean DEFAULT false NOT NULL,
	"bootstrap_status" text DEFAULT 'none' NOT NULL,
	"bootstrap_token_hash" text,
	"bootstrap_token_expires_at" timestamp,
	"captive_template_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captive_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"logo_url" text,
	"background_url" text,
	"primary_color" text DEFAULT '#0f172a' NOT NULL,
	"background_color" text DEFAULT '#f8fafc' NOT NULL,
	"title" text DEFAULT 'Bienvenue sur le réseau Wi-Fi' NOT NULL,
	"subtitle" text DEFAULT 'Entrez votre code d''accès pour vous connecter.' NOT NULL,
	"button_label" text DEFAULT 'Se connecter' NOT NULL,
	"voucher_field_label" text DEFAULT 'Code d''accès' NOT NULL,
	"terms_text" text,
	"footer_text" text,
	"mobile_money_enabled" boolean DEFAULT false NOT NULL,
	"template_type" text DEFAULT 'parametric' NOT NULL,
	"package_files" jsonb,
	"package_support_whatsapp" text,
	"package_support_phone" text,
	"package_vendors" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text,
	"expense_date" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_access_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"requester_email" text NOT NULL,
	"requester_name" text NOT NULL,
	"feature" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"consumed_at" timestamp,
	"decided_at" timestamp,
	"decided_by" uuid,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "float_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip_address" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meta_pixel_id" text,
	"ga4_measurement_id" text,
	"gtm_id" text,
	"tiktok_pixel_id" text,
	"adsense_client_id" text,
	"adsense_slot_id" text,
	"adsense_enabled" boolean DEFAULT false NOT NULL,
	"community_youtube_url" text,
	"community_telegram_url" text,
	"community_whatsapp_url" text,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"facebook_page_id" text,
	"facebook_page_token" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"free_router_setup_used" boolean DEFAULT false NOT NULL,
	"bonus_free_router_until" timestamp,
	"account_type" text DEFAULT 'user' NOT NULL,
	"reseller_activated_at" timestamp,
	"reseller_expires_at" timestamp,
	"reseller_quota_used" integer DEFAULT 0 NOT NULL,
	"vpn_quota_mode" text DEFAULT 'default' NOT NULL,
	"vpn_quota_expires_at" timestamp,
	"walled_garden_disabled_hosts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"referral_code" text,
	"referred_by_org_id" uuid,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"router_id" uuid,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"duration_value" integer NOT NULL,
	"duration_unit" text DEFAULT 'Hours' NOT NULL,
	"upload_mbps" integer DEFAULT 5 NOT NULL,
	"download_mbps" integer DEFAULT 5 NOT NULL,
	"commission_cents" integer DEFAULT 0 NOT NULL,
	"billing_starts_on" text DEFAULT 'Upon First Use' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"portal_pay_disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_gateways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"merchant_id" text,
	"api_key_encrypted" text,
	"webhook_id" text,
	"webhook_secret_encrypted" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_vpn_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"label" text NOT NULL,
	"method" text NOT NULL,
	"username" text,
	"password_encrypted" text,
	"peer_public_key" text,
	"vpn_ip" text,
	"remote_host" text NOT NULL,
	"remote_port" integer NOT NULL,
	"display_port" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "portal_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"router_id" uuid NOT NULL,
	"package_id" uuid,
	"phone" text NOT NULL,
	"mac" text NOT NULL,
	"profile_name" text,
	"price_cents" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_at" timestamp,
	"payment_reference" text,
	"voucher_id" uuid,
	"failure_reason" text,
	"sms_status" text DEFAULT 'sent' NOT NULL,
	"sms_message_id" text,
	"sms_error" text,
	"sms_attempts" integer DEFAULT 0 NOT NULL,
	"sms_last_attempt_at" timestamp,
	"sms_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"fulfilled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "portal_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"last_sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"ip_address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_org_id" uuid NOT NULL,
	"referred_org_id" uuid NOT NULL,
	"event" text NOT NULL,
	"amount_sc_cents" integer NOT NULL,
	"ledger_entry_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_access_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"requester_email" text NOT NULL,
	"requester_name" text NOT NULL,
	"router_id" uuid,
	"router_name" text,
	"service" text NOT NULL,
	"billing_period" text NOT NULL,
	"amount_fcfa" integer NOT NULL,
	"payment_method" text NOT NULL,
	"proof_url" text,
	"payment_reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"consumed_at" timestamp,
	"decided_at" timestamp,
	"decided_by" uuid,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"router_id" uuid,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_key" text NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"revoked_by" uuid,
	"revoked_at" timestamp,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roaming_device_binding_routers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"binding_id" uuid NOT NULL,
	"router_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp,
	"synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "roaming_device_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"voucher_id" uuid NOT NULL,
	"mac_address" text NOT NULL,
	"bound_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "roaming_group_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"price_override_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roaming_group_routers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"router_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roaming_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roaming_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_value" integer NOT NULL,
	"duration_unit" text DEFAULT 'Hours' NOT NULL,
	"upload_mbps" integer DEFAULT 5 NOT NULL,
	"download_mbps" integer DEFAULT 5 NOT NULL,
	"default_price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "router_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"router_id" uuid,
	"router_name" text NOT NULL,
	"model" text,
	"ros_version" text,
	"serial_number" text,
	"identity" text,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"payload" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"counts" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "router_mikhmon_cloud_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"container_name" text NOT NULL,
	"local_port" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "router_mikhmon_cloud_instances_router_id_unique" UNIQUE("router_id"),
	CONSTRAINT "router_mikhmon_cloud_instances_domain_unique" UNIQUE("domain"),
	CONSTRAINT "router_mikhmon_cloud_instances_container_name_unique" UNIQUE("container_name"),
	CONSTRAINT "router_mikhmon_cloud_instances_local_port_unique" UNIQUE("local_port")
);
--> statement-breakpoint
CREATE TABLE "router_port_forwards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"service" text NOT NULL,
	"target_port" integer NOT NULL,
	"public_port" integer NOT NULL,
	"tunnel_ip" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"billing_period" text DEFAULT 'monthly' NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "router_port_forwards_public_port_unique" UNIQUE("public_port")
);
--> statement-breakpoint
CREATE TABLE "router_replacements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_router_id" uuid NOT NULL,
	"replacement_router_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "router_restore_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"backup_id" uuid,
	"target_router_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"progress" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "router_serial_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" text NOT NULL,
	"router_id" uuid,
	"org_id" uuid,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp,
	"released_by" uuid,
	CONSTRAINT "router_serial_locks_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "router_serial_unlock_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"requester_email" text NOT NULL,
	"requester_name" text NOT NULL,
	"serial_number" text NOT NULL,
	"router_id" uuid,
	"router_name" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp,
	"decided_by" uuid,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "router_uploaded_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"uploaded_by_email" text,
	"uploaded_by_name" text,
	"file_name" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"data" text NOT NULL,
	"fetch_token_hash" text,
	"fetch_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"model" text,
	"host" text,
	"api_port" integer DEFAULT 8728,
	"username" text,
	"password_encrypted" text,
	"status" text DEFAULT 'offline' NOT NULL,
	"last_sync_at" timestamp,
	"offline_alerted_at" timestamp,
	"uptime_seconds" integer DEFAULT 0,
	"active_users" integer DEFAULT 0,
	"cpu_load" integer DEFAULT 0,
	"memory_usage" numeric(5, 2) DEFAULT '0',
	"connection_method" text DEFAULT 'direct' NOT NULL,
	"tunnel_ip" text,
	"wg_peer_public_key" text,
	"relay_shard" text,
	"supports_containers" boolean,
	"ipv6_bypass_enabled" boolean DEFAULT false NOT NULL,
	"ipv6_bypass_enabled_at" timestamp,
	"ports_locked_at" timestamp,
	"locked_interfaces" jsonb,
	"mikhmon_session_at" timestamp,
	"install_token_hash" text,
	"install_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"auto_setup_billed" boolean DEFAULT false NOT NULL,
	"captive_template_id" uuid,
	"hotspot_bridge_name" text,
	"hotspot_server_name" text,
	"portal_support_whatsapp" text,
	"portal_support_phone" text,
	"portal_vendors" jsonb,
	"last_auto_setup_config" jsonb
);
--> statement-breakpoint
CREATE TABLE "safecoin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"balance_sc_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "safecoin_accounts_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "safecoin_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"amount_sc_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safecoin_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"amount_sc_cents" integer NOT NULL,
	"reference_fcfa_cents" integer,
	"status" text DEFAULT 'completed' NOT NULL,
	"idempotency_key" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"note" text,
	"payment_reference" text,
	"payment_method" text,
	"country_iso2" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "safecoin_ledger_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "safecoin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_fcfa_per_sc" integer DEFAULT 100 NOT NULL,
	"recharge_fee_sc_cents" integer DEFAULT 0 NOT NULL,
	"vpn_fee_sc_cents" integer DEFAULT 0 NOT NULL,
	"auto_setup_fee_sc_cents" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_gateways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"sender_id" text,
	"api_key_encrypted" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"role" text,
	"quote" text NOT NULL,
	"rating" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"mfa_secret_encrypted" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_backup_codes_hash" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"activation_token_hash" text,
	"activation_token_expires_at" timestamp,
	"password_reset_token_hash" text,
	"password_reset_token_expires_at" timestamp,
	"country" text,
	"phone_dial_code" text,
	"phone" text,
	"whatsapp" text,
	"telegram" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "voucher_routers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"voucher_id" uuid NOT NULL,
	"router_id" uuid NOT NULL,
	"profile_name" text,
	"status" text DEFAULT 'PROVISIONED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"username" text NOT NULL,
	"package_id" uuid,
	"roaming_group_id" uuid,
	"roaming_profile_id" uuid,
	"sold_price_cents" integer,
	"router_id" uuid,
	"profile_name" text,
	"agent_id" uuid,
	"status" text DEFAULT 'PROVISIONED' NOT NULL,
	"first_login_at" timestamp,
	"expires_at" timestamp,
	"use_case" text DEFAULT 'Batch Create' NOT NULL,
	"note" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vpn_access_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"org_id" uuid NOT NULL,
	"router_id" uuid NOT NULL,
	"replacement_id" uuid,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"purpose" text DEFAULT 'topup' NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"payment_reference" text,
	"payment_method" text,
	"country_iso2" text,
	"related_forward_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_setup_authorizations" ADD CONSTRAINT "auto_setup_authorizations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_setup_authorizations" ADD CONSTRAINT "auto_setup_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_setup_authorizations" ADD CONSTRAINT "auto_setup_authorizations_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_setup_authorizations" ADD CONSTRAINT "auto_setup_authorizations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_shares" ADD CONSTRAINT "blog_post_shares_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridges" ADD CONSTRAINT "bridges_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridges" ADD CONSTRAINT "bridges_captive_template_id_captive_templates_id_fk" FOREIGN KEY ("captive_template_id") REFERENCES "public"."captive_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captive_templates" ADD CONSTRAINT "captive_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_access_authorizations" ADD CONSTRAINT "feature_access_authorizations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_access_authorizations" ADD CONSTRAINT "feature_access_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_access_authorizations" ADD CONSTRAINT "feature_access_authorizations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transactions" ADD CONSTRAINT "float_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transactions" ADD CONSTRAINT "float_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_referred_by_org_id_organizations_id_fk" FOREIGN KEY ("referred_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateways" ADD CONSTRAINT "payment_gateways_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_vpn_access" ADD CONSTRAINT "personal_vpn_access_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_orders" ADD CONSTRAINT "portal_orders_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_otps" ADD CONSTRAINT "portal_otps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_org_id_organizations_id_fk" FOREIGN KEY ("referrer_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referred_org_id_organizations_id_fk" FOREIGN KEY ("referred_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_authorizations" ADD CONSTRAINT "remote_access_authorizations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_authorizations" ADD CONSTRAINT "remote_access_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_authorizations" ADD CONSTRAINT "remote_access_authorizations_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_authorizations" ADD CONSTRAINT "remote_access_authorizations_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_grants" ADD CONSTRAINT "remote_access_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_grants" ADD CONSTRAINT "remote_access_grants_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_grants" ADD CONSTRAINT "remote_access_grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_access_grants" ADD CONSTRAINT "remote_access_grants_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_device_binding_routers" ADD CONSTRAINT "roaming_device_binding_routers_binding_id_roaming_device_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."roaming_device_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_device_binding_routers" ADD CONSTRAINT "roaming_device_binding_routers_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_device_bindings" ADD CONSTRAINT "roaming_device_bindings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_device_bindings" ADD CONSTRAINT "roaming_device_bindings_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_group_offers" ADD CONSTRAINT "roaming_group_offers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_group_offers" ADD CONSTRAINT "roaming_group_offers_group_id_roaming_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."roaming_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_group_offers" ADD CONSTRAINT "roaming_group_offers_profile_id_roaming_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."roaming_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_group_routers" ADD CONSTRAINT "roaming_group_routers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_group_routers" ADD CONSTRAINT "roaming_group_routers_group_id_roaming_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."roaming_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_group_routers" ADD CONSTRAINT "roaming_group_routers_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_groups" ADD CONSTRAINT "roaming_groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roaming_profiles" ADD CONSTRAINT "roaming_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_mikhmon_cloud_instances" ADD CONSTRAINT "router_mikhmon_cloud_instances_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_port_forwards" ADD CONSTRAINT "router_port_forwards_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_replacements" ADD CONSTRAINT "router_replacements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_replacements" ADD CONSTRAINT "router_replacements_source_router_id_routers_id_fk" FOREIGN KEY ("source_router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_replacements" ADD CONSTRAINT "router_replacements_replacement_router_id_routers_id_fk" FOREIGN KEY ("replacement_router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_replacements" ADD CONSTRAINT "router_replacements_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_restore_jobs" ADD CONSTRAINT "router_restore_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_restore_jobs" ADD CONSTRAINT "router_restore_jobs_backup_id_router_backups_id_fk" FOREIGN KEY ("backup_id") REFERENCES "public"."router_backups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_restore_jobs" ADD CONSTRAINT "router_restore_jobs_target_router_id_routers_id_fk" FOREIGN KEY ("target_router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_serial_locks" ADD CONSTRAINT "router_serial_locks_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_serial_locks" ADD CONSTRAINT "router_serial_locks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_serial_locks" ADD CONSTRAINT "router_serial_locks_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_serial_unlock_requests" ADD CONSTRAINT "router_serial_unlock_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_serial_unlock_requests" ADD CONSTRAINT "router_serial_unlock_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_serial_unlock_requests" ADD CONSTRAINT "router_serial_unlock_requests_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_serial_unlock_requests" ADD CONSTRAINT "router_serial_unlock_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_uploaded_backups" ADD CONSTRAINT "router_uploaded_backups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routers" ADD CONSTRAINT "routers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routers" ADD CONSTRAINT "routers_captive_template_id_captive_templates_id_fk" FOREIGN KEY ("captive_template_id") REFERENCES "public"."captive_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safecoin_accounts" ADD CONSTRAINT "safecoin_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safecoin_fee_rules" ADD CONSTRAINT "safecoin_fee_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safecoin_ledger" ADD CONSTRAINT "safecoin_ledger_account_id_safecoin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."safecoin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safecoin_ledger" ADD CONSTRAINT "safecoin_ledger_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safecoin_ledger" ADD CONSTRAINT "safecoin_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safecoin_settings" ADD CONSTRAINT "safecoin_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_gateways" ADD CONSTRAINT "sms_gateways_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_routers" ADD CONSTRAINT "voucher_routers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_routers" ADD CONSTRAINT "voucher_routers_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_routers" ADD CONSTRAINT "voucher_routers_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_roaming_group_id_roaming_groups_id_fk" FOREIGN KEY ("roaming_group_id") REFERENCES "public"."roaming_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_roaming_profile_id_roaming_profiles_id_fk" FOREIGN KEY ("roaming_profile_id") REFERENCES "public"."roaming_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_access_audit_events" ADD CONSTRAINT "vpn_access_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_access_audit_events" ADD CONSTRAINT "vpn_access_audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_access_audit_events" ADD CONSTRAINT "vpn_access_audit_events_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_access_audit_events" ADD CONSTRAINT "vpn_access_audit_events_replacement_id_router_replacements_id_fk" FOREIGN KEY ("replacement_id") REFERENCES "public"."router_replacements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_related_forward_id_router_port_forwards_id_fk" FOREIGN KEY ("related_forward_id") REFERENCES "public"."router_port_forwards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_shares_post_channel_uniq" ON "blog_post_shares" USING btree ("post_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "bridges_router_name_idx" ON "bridges" USING btree ("router_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_otps_org_phone_idx" ON "portal_otps" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "public_submission_attempts_bucket_ip_created_at_idx" ON "public_submission_attempts" USING btree ("bucket","ip_address","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_referred_event_key" ON "referral_rewards" USING btree ("referred_org_id","event");--> statement-breakpoint
CREATE INDEX "referral_rewards_referrer_idx" ON "referral_rewards" USING btree ("referrer_org_id");--> statement-breakpoint
CREATE INDEX "remote_access_grants_org_status_expires_idx" ON "remote_access_grants" USING btree ("org_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "remote_access_grants_router_status_idx" ON "remote_access_grants" USING btree ("router_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "roaming_device_binding_routers_binding_router_idx" ON "roaming_device_binding_routers" USING btree ("binding_id","router_id");--> statement-breakpoint
CREATE INDEX "roaming_device_binding_routers_router_status_idx" ON "roaming_device_binding_routers" USING btree ("router_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "roaming_device_bindings_voucher_idx" ON "roaming_device_bindings" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "roaming_device_bindings_org_voucher_idx" ON "roaming_device_bindings" USING btree ("org_id","voucher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roaming_group_offers_group_profile_idx" ON "roaming_group_offers" USING btree ("group_id","profile_id");--> statement-breakpoint
CREATE INDEX "roaming_group_offers_org_group_idx" ON "roaming_group_offers" USING btree ("org_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roaming_group_routers_group_router_idx" ON "roaming_group_routers" USING btree ("group_id","router_id");--> statement-breakpoint
CREATE INDEX "roaming_group_routers_org_router_idx" ON "roaming_group_routers" USING btree ("org_id","router_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roaming_groups_org_code_idx" ON "roaming_groups" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "roaming_groups_org_created_idx" ON "roaming_groups" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roaming_profiles_org_name_idx" ON "roaming_profiles" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "roaming_profiles_org_active_idx" ON "roaming_profiles" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "router_backups_router_id_idx" ON "router_backups" USING btree ("router_id");--> statement-breakpoint
CREATE INDEX "router_backups_org_id_idx" ON "router_backups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "router_backups_created_at_idx" ON "router_backups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "router_mikhmon_cloud_instances_status_idx" ON "router_mikhmon_cloud_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "router_replacements_org_created_idx" ON "router_replacements" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "router_replacements_replacement_idx" ON "router_replacements" USING btree ("replacement_router_id");--> statement-breakpoint
CREATE INDEX "router_restore_jobs_org_id_idx" ON "router_restore_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "router_restore_jobs_target_idx" ON "router_restore_jobs" USING btree ("target_router_id");--> statement-breakpoint
CREATE INDEX "router_restore_jobs_status_idx" ON "router_restore_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "router_uploaded_backups_org_id_idx" ON "router_uploaded_backups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "router_uploaded_backups_created_at_idx" ON "router_uploaded_backups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "safecoin_ledger_org_created_idx" ON "safecoin_ledger" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "safecoin_ledger_reference_idx" ON "safecoin_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_routers_voucher_router_idx" ON "voucher_routers" USING btree ("voucher_id","router_id");--> statement-breakpoint
CREATE INDEX "vouchers_org_deleted_created_idx" ON "vouchers" USING btree ("org_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "vpn_access_audit_events_router_created_idx" ON "vpn_access_audit_events" USING btree ("router_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_transactions_payment_reference_idx" ON "wallet_transactions" USING btree ("payment_reference");