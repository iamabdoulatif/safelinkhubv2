ALTER TABLE "routers"
ADD COLUMN IF NOT EXISTS "wireguard_peer_disabled" boolean NOT NULL DEFAULT false;
