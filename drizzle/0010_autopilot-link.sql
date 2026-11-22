-- Liaison SafeLink Auto-Pilot (voir autopilotLinks dans schema.ts).
-- Additive. À appliquer AVANT le déploiement (le code lit la table).
CREATE TABLE IF NOT EXISTS "autopilot_links" (
  "org_id" uuid PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
  "code_hash" text,
  "code_expires_at" timestamp,
  "token_hash" text UNIQUE,
  "linked_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
