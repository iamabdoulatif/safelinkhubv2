ALTER TABLE routers
  ADD COLUMN IF NOT EXISTS supports_containers boolean;

CREATE TABLE IF NOT EXISTS router_mikhmon_cloud_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL UNIQUE REFERENCES routers(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  container_name text NOT NULL UNIQUE,
  local_port integer NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT router_mikhmon_cloud_instances_local_port_range
    CHECK (local_port BETWEEN 20000 AND 20999)
);

CREATE INDEX IF NOT EXISTS router_mikhmon_cloud_instances_status_idx
  ON router_mikhmon_cloud_instances(status);
