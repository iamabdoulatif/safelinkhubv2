# Relay sharding (s1–s4.safelinkhub.io) + cloud-hosted MikHmon — Design

Date: 2026-07-05

## Problem

Today all direct-access remote links (WinBox, WebFig, SSH/FileZilla, MikHmon)
are built as `${relayHost}:${publicPort}` where `relayHost` is a single
global value from `getRelayPublicHost()` (env var `WG_RELAY_PUBLIC_HOST` /
`WG_RELAY_HOST`). The port itself comes from a single shared iptables DNAT
range on the relay VPS (`seq 30000 30999`, 1000 ports total, see
`allocatePortForward` in `src/lib/mikrotik/relay.ts`).

Two problems to solve:

1. The user wants remote-access URLs to look like `s1.safelinkhub.io:PORT`,
   `s2.safelinkhub.io:PORT`, etc. (DNS records for `s1`–`s4.safelinkhub.io`
   already exist, unused) instead of a single relay hostname, with a much
   larger auto-generated port pool (~30000 ports total, not 1000).
2. MikroTik boards that don't support RouterOS Container (e.g. RB951, older
   ARMv5 boards) currently have **no way to run MikHmon at all** — MikHmon
   only exists today as a container running physically inside
   container-capable routers. A "cloud-hosted" MikHmon needs to be built for
   these boards.

## Scope

This design covers:

- Sharding the relay's public hostname + port pool across 4 hostnames.
- Persisting router capability (`supportsContainers`) and shard assignment
  (`relayShard`) on the `routers` table.
- A new cloud-hosted MikHmon feature (per-router Docker container on the
  relay VPS) for non-container-capable boards.

Out of scope (tracked separately, already documented in `deploy/README.md`):
the actual cutover of the WireGuard/OpenVPN relay server from the old AWS EC2
instance to the new Hostinger VPS (`31.97.153.83`). This design prepares the
code to be shard-aware ahead of that cutover; it does not perform the cutover
itself.

## Architecture

### Shards

4 fixed hostnames, all currently pointing at the same physical VPS
(`31.97.153.83`) — these are **logical** shards (independent iptables port
ranges on one machine), not 4 physical servers:

| Shard | Hostname             | Port range      |
|-------|----------------------|------------------|
| s1    | s1.safelinkhub.io    | 30000–59999      |
| s2    | s2.safelinkhub.io    | 60000–89999      |
| s3    | s3.safelinkhub.io    | 90000–119999     |
| s4    | s4.safelinkhub.io    | 120000–149999    |

Adding a 5th shard later is just a new DNS A record + a new range constant —
no architecture change.

### Shard assignment

Each router is assigned a shard **once**, at router creation, round-robin
over the 4 shards, stored on `routers.relayShard`. All of that router's
services (WinBox, WebFig, SSH, MikHmon — container-hosted or cloud-hosted)
use this same hostname; only the port differs per service.

### Config

`getRelayPublicHost(): string` becomes `getRelayPublicHost(shard: string): string`,
returning `` `${shard}.${RELAY_BASE_DOMAIN}` ``, where `RELAY_BASE_DOMAIN` is
a new env var (`safelinkhub.io`). This replaces the single
`WG_RELAY_PUBLIC_HOST` value. `WG_RELAY_HOST` (the relay's actual SSH/IP
target) is unchanged — there is still exactly one VPS to SSH into regardless
of shard.

## Data model changes

- `routers`:
  - `+ relayShard: text` — one of `"s1" | "s2" | "s3" | "s4"`, assigned at
    router creation (round-robin), immutable afterward.
  - `+ supportsContainers: boolean` — persisted at auto-setup time from the
    value already computed live by `device-detect.ts`
    (`architectureSupportsContainers`), currently discarded after the setup
    flow finishes. This lets the "enable MikHmon" flow later decide
    container-hosted vs. cloud-hosted without reconnecting to the router
    live to re-detect architecture.
- `routerPortForwards`: **no change.** The shard hostname is always derived
  via `routerPortForwards.routerId → routers.relayShard` — no need to
  duplicate it per forward, since a router's shard never changes.
- New table `routerMikhmonCloudInstances`:
  - `routerId: uuid` (FK → routers, cascade delete)
  - `containerName: text` (e.g. `mikhmon-<routerId>`)
  - `containerPort: integer` (local VPS port the container's port 80 is
    bound to, from a dedicated pool, e.g. 20000–20999, one per router)
  - `status: text` (`active` | ...)
  - `createdAt: timestamp`

## Provisioning & teardown

### Classic port-forward (WinBox / WebFig / SSH / container-hosted MikHmon)

Unchanged in principle, shard-aware in range: `allocatePortForward(shard,
tunnelIp, targetPort)` scans the free-port list within that shard's iptables
range (e.g. `seq 60000 89999` for `s2`) instead of one global range.
`revokePortForward` is unchanged — it already receives the exact port to
remove.

### Cloud-hosted MikHmon (non-container routers)

1. On enabling the "mikhmon" service for a router with `supportsContainers =
   false`:
   - `runOnRelay()` runs `docker run -d --name mikhmon-<routerId> -p
     127.0.0.1:<containerPort>:80 <same mikhmonv3-safelinkhub image used
     inside routers>`, configured to point at the router's RouterOS API via
     its `tunnelIp` (10.66.x.x / 10.67.x.x — already reachable from the VPS,
     since it's the WireGuard/OpenVPN server) instead of `11.11.11.11` (the
     in-router container's local IP).
   - Insert the `routerMikhmonCloudInstances` row.
   - Reuse `allocatePortForward(shard, tunnelIp="127.0.0.1",
     targetPort=containerPort)` unchanged — the shard's DNAT mechanism
     treats the cloud MikHmon container exactly like any other remote
     service; no changes to the iptables DNAT/MASQUERADE/FORWARD logic.
2. On disabling: `revokePortForward` (unchanged) → `docker rm -f
   mikhmon-<routerId>` → delete the `routerMikhmonCloudInstances` row.

**Assumption to verify during implementation (not a design blocker):** the
cloud MikHmon container must be able to reach the router's `tunnelIp` from
the VPS's default Docker bridge network. This should work natively (the VPS
already forwards traffic to its WireGuard/OpenVPN peers), but must be
confirmed with a real test rather than assumed.

## UI

`relayHost` stops being a single global prop threaded from `page.tsx`.
`DirectAccessSection.tsx` and `mikhmon-online.ts` instead compute the address
via `getRelayPublicHost(router.relayShard)` per router. A container-hosted
and a cloud-hosted MikHmon service render identically to the admin (same
`sN.safelinkhub.io:PORT` shape, same activation toggle) — an optional badge
in the expanded router details ("Hébergé cloud" vs. "Sur le routeur") is the
only visible distinction.

## Rollout vs. the EC2 → Hostinger relay migration

This design is built directly against the target Hostinger VPS, consistent
with the migration already documented in `deploy/README.md` and the
`relay.safelinkhub.io` DNS record added ahead of this work.

1. **Step A (this design)**: add `routers.relayShard` +
   `routers.supportsContainers`, make the code shard-aware, but keep
   `WG_RELAY_HOST` / `WG_RELAY_SSH_*` pointed at the still-active EC2 relay
   until the Hostinger VPS actually hosts the WireGuard/OpenVPN server +
   Docker. Existing routers get a `relayShard` backfilled (round-robin over
   existing rows) but keep resolving through the one real EC2 hostname until
   the shard DNS records are live on the relay that's actually in use — no
   visible change for routers already in production at this step.
2. **Step B (relay cutover, out of scope here)**: when the Hostinger VPS
   takes over as the WireGuard/OpenVPN relay (already documented in
   `deploy/README.md`), the `s1`–`s4` DNS records (already on
   `31.97.153.83`) become live, `WG_RELAY_HOST`/SSH vars switch over, routers
   re-handshake on the new relay per the existing documented procedure, and
   their forwards get recreated on the new relay under their already-assigned
   `relayShard`.
3. This design does not implement the relay cutover itself (already planned
   separately) — it only prepares the code to be shard-aware ahead of it.

## Testing

- `relay.test.ts`: `getRelayPublicHost(shard)` returns the right hostname
  per shard; `allocatePortForward` respects the passed shard's range (mocked
  SSH).
- `port-forward.test.ts` (extended): round-robin shard assignment at router
  creation; a router's services all reuse its assigned shard.
- New `mikhmon-cloud.test.ts`: container provisioning/teardown (mocked
  `runOnRelay`), and that `supportsContainers = false` routes to the cloud
  path rather than the in-router-container path.
- No real integration test against the VPS in CI — only a manual
  post-deployment check (as already documented in `deploy/README.md`)
  validates real container → `tunnelIp` reachability.
