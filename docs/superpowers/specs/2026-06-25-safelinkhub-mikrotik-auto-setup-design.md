# SafeLinkHub MikroTik Auto-Setup Design

## Goal

Build a complete MikroTik auto-setup flow that applies the full RSC-derived SafeLinkHub hotspot configuration, supports both the SaaS UI and a standalone script, and can be rerun safely on the same router.

The implementation will use a single shared provisioning engine named `SafeLinkHubMikroTikAutoProvisioner`. The engine must configure the router end to end, reboot after a successful complete configuration, and verify the result when requested.

## Chosen Approach

Use one shared TypeScript provisioning engine and expose it through two entry points:

1. SafeLinkHub SaaS action from `/admin/settings/router-setup`.
2. Standalone script in `scripts/safelinkhub-auto-provision/safelinkhub-auto-provision.js`.

This prevents the SaaS button and the local script from drifting into different MikroTik configurations.

## Router Test Target

The standalone script will support the local test router:

- Host: `192.168.1.106`
- API port: `8728`
- Username: `admin`
- Password: read from `.env`, not hardcoded in source

The script may document `admin123` as the local example password in `.env.example` only if needed for a private test environment. The safer default is to leave the password blank in `.env.example`.

## Configuration Target

The auto-setup must apply the complete configuration from the provided RSC prompt. Values are defaults unless explicitly overridden by UI/script configuration.

### Core Network

- Add tmpfs disk: `slot=tmp`, `tmpfs-max-size=150000000`, `type=tmpfs`.
- Create bridges `CONTAINERS` and `HOTSPOT`.
- Rename WAN ethernet from `ether1` to `E1-WAN-FAI`.
- Configure WiFi:
  - `wifi1`: 5 GHz AX, SSID `DU BONHEUR WIFI`, country `United States`, enabled.
  - `wifi2`: 2 GHz AX, SSID `DU BONHEUR WIFI`, country `United States`, enabled.
- Create VETH `MIKHMON`:
  - Address `11.11.11.11/28`
  - Gateway `11.11.11.1`
  - DHCP disabled
  - MAC values from the prompt when RouterOS accepts them.
- Create interface lists `WAN` and `LAN`.
- Add `E1-WAN-FAI` to `WAN`.
- Add `HOTSPOT` to `LAN`.
- Attach `ether2`, `ether3`, `ether4`, `ether5`, `wifi1`, and `wifi2` to `HOTSPOT` when present.
- Attach `MIKHMON` to `CONTAINERS`.

### IP, DHCP, DNS

- Add `10.0.0.1/8` on `HOTSPOT`, network `10.0.0.0`.
- Add `11.11.11.1/28` on `CONTAINERS`, network `11.11.11.0`.
- Enable IP Cloud DDNS.
- Add or update WAN DHCP client `client1` on `E1-WAN-FAI`.
- Add or update pool `POOL-HOTSPOT` with range `10.0.0.2-10.255.255.254`.
- Add or update DHCP server `dhcp1` on `HOTSPOT`.
- Add or update DHCP network `10.0.0.0/8`, DNS `10.0.0.1,1.1.1.1`, gateway `10.0.0.1`, netmask `8`.
- Set DNS resolver to allow remote requests and use `208.67.222.222,8.8.8.8`.

### Firewall and NAT

- Add disabled passthrough hotspot placeholder in filter chain `unused-hs-chain`.
- Add TTL mangle rule on `HOTSPOT` postrouting with `new-ttl=set:1`.
- Add disabled passthrough hotspot placeholder in NAT chain `unused-hs-chain`.
- Add WAN masquerade out `E1-WAN-FAI`.
- Add hotspot network masquerade for `10.0.0.0/8`.
- Add Docker network masquerade for `11.11.11.0/28`.
- Add remote access dst-nat:
  - TCP `8088` to `11.11.11.11:80`
  - TCP `8087` from `10.0.0.1` to `11.11.11.11:80`
- The `8087` Docker dst-nat rule is enabled only after the MikHmon container is confirmed active.

### Hotspot and Captive Portal

- Add or update hotspot profile `DUBONHEUR`:
  - DNS name `dubonheur.ci`
  - Hotspot address `10.0.0.1`
  - HTML directory and override `DUBONHEUR`
  - Cookie lifetime `52w1d`
  - Queue install enabled
  - Login by `mac,cookie,http-chap,http-pap,mac-cookie`
  - MAC auth mode `mac-as-username-and-password`
- Add or update hotspot `hotspot1` on `HOTSPOT`, pool `POOL-HOTSPOT`, profile `DUBONHEUR`, `addresses-per-mac=1`, enabled.
- Add default hotspot users `admin` and `president01@` if missing.

The captive portal must trigger the operating system captive-network assistant when a client joins the WiFi. The implementation will support this by:

- Ensuring WiFi radios are bridged into the hotspot bridge.
- Ensuring DHCP clients receive the hotspot gateway as DNS.
- Ensuring DNS remote requests are enabled on the router.
- Ensuring the hotspot profile has `dns-name=dubonheur.ci` and the correct hotspot address.
- Ensuring unauthenticated HTTP traffic is intercepted by RouterOS Hotspot.
- Adding SafeLinkHub app domains to the hotspot walled garden when the SaaS bootstrap step is used, so the login assets and callback remain reachable.

RouterOS and client operating systems ultimately control whether the portal appears as a modal/popup versus opening in a browser tab. The configuration will use the standard RouterOS Hotspot behavior that iOS, Android, Windows, and macOS detect as a captive portal.

### System Hardening and Utilities

- Disable SSH and Telnet.
- Move WebFig `www` to port `85`.
- Disable `api-ssl`.
- Keep the active API service available for the current management path so SafeLinkHub does not cut off its own connection during setup.
- Set clock timezone to `Africa/Abidjan`.
- Set identity to `HSPT-DUBONHEUR`.
- Enable NTP client.
- Add NTP servers `196.200.131.160` and `196.10.52.57`.
- Add or update scheduler `CLEAN_JOB`.
- Add or update user group `safelinkhub-group` with the policy from the prompt.
- Add or update system script `export-all` with the export commands from the prompt.

### MikHmon Container

- Verify the `container` package exists and is enabled.
- Verify `CONTAINERS`, `MIKHMON`, and `11.11.11.1/28` on `CONTAINERS` are present before adding the container.
- Configure registry:
  - `layer-dir=/flash/mikhmon-layers`
  - `registry-url=https://registry-1.docker.io`
  - `tmpdir=/tmp`
- Add or update container:
  - Name `mikhmon-sf-v1:latest`
  - Image `latif225/mikhmon-sf-v1:latest`
  - Interface `MIKHMON`
  - Layer dir `/flash/mikhmon-app`
  - Root dir `/mikhmon-app`
  - Start on boot `yes`
- If the container exists but is stopped, start it.
- Poll status after creation/start and include the final state in the report.

## Idempotence and Migration

Every setup method must use a find/update/add pattern. Re-running auto-setup must not create duplicates or fail because an item already exists.

The migration strategy is "controlled SafeLinkHub reset":

- Recognize current target names: `HOTSPOT`, `CONTAINERS`, `MIKHMON`, `POOL-HOTSPOT`, `dhcp1`, `hotspot1`, `DUBONHEUR`, `CLEAN_JOB`, `export-all`, `safelinkhub-group`.
- Recognize older SafeLinkHub names such as `SAFELINKHUB-BRIDGE` and `DOCKERS`.
- Move LAN bridge ports from older SafeLinkHub/default bridge rows into `HOTSPOT` instead of blindly adding duplicate bridge ports.
- Remove or replace only SafeLinkHub-owned entries identified by exact names or SafeLinkHub-specific comments.
- Preserve unrelated router rules, users, bridges, and profiles.

## Execution Order

The engine runs these steps in order:

1. `connect`
2. `setupDisk`
3. `setupBridges`
4. `renameWAN`
5. `setupWiFi`
6. `createVETH`
7. `setupInterfaceLists`
8. `assignBridgePorts`
9. `setupIPAddresses`
10. `setupCloudDDNS`
11. `setupDHCPClient`
12. `setupIPPool`
13. `setupDHCPServer`
14. `setupDNS`
15. `setupFirewallFilter`
16. `setupFirewallMangle`
17. `setupFirewallNAT`
18. `setupHotspotProfile`
19. `setupHotspot`
20. `setupHotspotUsers`
21. `hardenServices`
22. `setupClock`
23. `setupIdentity`
24. `setupNTP`
25. `setupScheduler`
26. `setupUserGroup`
27. `setupExportScript`
28. `setupContainer`
29. `reboot`
30. `verifyAfterReboot` when requested and possible
31. `disconnect`

Critical failures stop the run before reboot:

- Connection failure
- Missing or failed `HOTSPOT` bridge
- Missing or failed hotspot gateway address
- Missing or failed DHCP/hotspot service
- Missing or failed `CONTAINERS`/VETH/container network when container setup is explicitly required

Non-critical failures are logged and the run continues.

## SaaS UI Flow

Keep the four-step router setup experience:

1. Connection setup.
2. Detection and prerequisites.
3. Complete configuration.
4. Reboot and verification.

The complete configuration card will call the shared engine through a server action. It will show:

- Step-by-step logs.
- Critical versus non-critical failures.
- Whether reboot was triggered.
- Whether the router came back online.
- Captive portal readiness checks.
- Container readiness and running status.

## Standalone Script

The standalone script will live in `scripts/safelinkhub-auto-provision/` and include:

- `safelinkhub-auto-provision.js`
- `README.md`
- `.env.example`

The script will accept `.env` values and CLI overrides. Required values:

- `MIKROTIK_HOST`
- `MIKROTIK_PORT`
- `MIKROTIK_USER`
- `MIKROTIK_PASSWORD`

Optional values mirror the default config: SSID, country, hotspot DNS name, profile name, identity, timezone, LAN network, container network, container image, reboot behavior, and verify-after-reboot behavior.

## Report Shape

Both SaaS and standalone script return the same report shape:

```json
{
  "success": true,
  "host": "192.168.1.106",
  "port": 8728,
  "identity": "HSPT-DUBONHEUR",
  "steps": {
    "bridges": { "status": "ok", "action": "updated" },
    "wifi": { "status": "ok", "ssid": "DU BONHEUR WIFI" },
    "veth": { "status": "ok", "name": "MIKHMON", "ip": "11.11.11.11/28" },
    "hotspot": { "status": "ok", "profile": "DUBONHEUR", "dnsName": "dubonheur.ci" },
    "captivePortal": { "status": "ok", "dnsName": "dubonheur.ci", "wifiBridgeReady": true },
    "container": { "status": "ok", "name": "mikhmon-sf-v1:latest", "running": true },
    "reboot": { "status": "ok", "triggered": true }
  },
  "errors": [],
  "durationMs": 45000
}
```

## Testing

Add tests around pure planning/helpers and command generation where possible:

- Default config matches the RSC prompt.
- Migration recognizes old SafeLinkHub names.
- Bridge port assignment updates an existing bridge-port row instead of adding a duplicate.
- NAT rules are keyed by action/chain/comment/ports to avoid duplicates.
- Container NAT `8087` is enabled only after container active status.
- Captive portal readiness reports fail if WiFi is not bridged, DNS is not enabled, or hotspot profile is missing `dns-name`.

For live validation, run the standalone script against `192.168.1.106:8728` after the spec and implementation plan are approved.

## Out of Scope

- Full factory reset of the MikroTik.
- Deleting unrelated customer firewall or routing rules.
- Guaranteeing the OS captive portal appears as a native popup on every client device. The router will be configured with standard captive portal behavior; device OS behavior varies.
