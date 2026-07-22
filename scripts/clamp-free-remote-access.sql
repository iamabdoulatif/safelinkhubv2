-- Keep existing direct-access forwards inside the organization's current
-- free VPN quota. This is intentionally idempotent and does not touch paid
-- overrides or unlimited quotas.
UPDATE router_port_forwards AS f
SET
  expires_at = o.vpn_quota_expires_at,
  billing_period = 'free_until'
FROM routers AS r
JOIN organizations AS o ON o.id = r.org_id
WHERE f.router_id = r.id
  AND f.status = 'active'
  AND o.vpn_quota_mode = 'free_until'
  AND o.vpn_quota_expires_at IS NOT NULL
  AND f.expires_at IS NOT NULL
  AND f.expires_at > o.vpn_quota_expires_at;
