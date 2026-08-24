CREATE TABLE "org_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "router_transfer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"from_org_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"to_org_id" uuid,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_transfer_requests" ADD CONSTRAINT "router_transfer_requests_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_transfer_requests" ADD CONSTRAINT "router_transfer_requests_from_org_id_organizations_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_transfer_requests" ADD CONSTRAINT "router_transfer_requests_to_org_id_organizations_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_transfer_requests" ADD CONSTRAINT "router_transfer_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_transfer_requests" ADD CONSTRAINT "router_transfer_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_invitations_org_idx" ON "org_invitations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_invitations_token_idx" ON "org_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "router_transfer_requests_status_idx" ON "router_transfer_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "router_transfer_requests_router_idx" ON "router_transfer_requests" USING btree ("router_id");