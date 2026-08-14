import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildControlCenterRouters,
  filterControlCenterRouters,
  getControlCenterMetrics,
  sortControlCenterRouters,
  type RemoteAccessControlRouter,
} from "./control-center";

const routers: RemoteAccessControlRouter[] = [
  {
    id: "online",
    name: "SHIA-HSPT",
    status: "online",
    lastSyncAt: "2026-08-13T10:00:00.000Z",
    connectionMethod: "vpn",
    tunnelIp: "10.0.0.2",
    ipv6BypassEnabled: false,
    activeForwards: [
      { id: "f1", service: "webfig", publicPort: 20111, endpoint: "https://s3.example:20111", expiresAt: null },
    ],
    auditEvents: [],
    replacementStatus: null,
  },
  {
    id: "offline",
    name: "HSPT-TOFESSO",
    status: "offline",
    lastSyncAt: "2026-08-13T09:00:00.000Z",
    connectionMethod: "vpn",
    tunnelIp: "10.0.0.3",
    ipv6BypassEnabled: false,
    activeForwards: [
      { id: "f2", service: "ssh", publicPort: 39055, endpoint: "s3.example:39055", expiresAt: null },
    ],
    auditEvents: [],
    replacementStatus: null,
  },
  {
    id: "new",
    name: "NOUVEAU-SITE",
    status: "pending",
    lastSyncAt: null,
    connectionMethod: "direct",
    tunnelIp: null,
    ipv6BypassEnabled: false,
    activeForwards: [],
    auditEvents: [],
    replacementStatus: null,
  },
];

test("sépare disponibilité, accès, vérifications et actions", () => {
  assert.deepEqual(getControlCenterMetrics(routers), {
    routerCount: 3,
    onlineCount: 1,
    activeAccessCount: 2,
    verificationCount: 1,
    actionRequiredCount: 1,
  });
});

test("ordonne les actions avant les vérifications", () => {
  assert.deepEqual(
    sortControlCenterRouters(routers).map((router) => router.id),
    ["new", "offline", "online"],
  );
});

test("recherche l’endpoint et applique le filtre d’attention", () => {
  assert.deepEqual(
    filterControlCenterRouters(routers, {
      query: "20111",
      status: "all",
      method: "all",
      incidentOnly: false,
    }).map((router) => router.id),
    ["online"],
  );
  assert.deepEqual(
    filterControlCenterRouters(routers, {
      query: "",
      status: "attention",
      method: "all",
      incidentOnly: false,
    }).map((router) => router.id),
    ["new", "offline"],
  );
});

test("construit une projection sans identifiant ni secret et sécurise les URLs web", () => {
  const projection = buildControlCenterRouters({
    routers: [
      {
        id: "r1",
        name: "SHIA-HSPT",
        status: "online",
        lastSyncAt: new Date("2026-08-13T10:00:00.000Z"),
        connectionMethod: "vpn",
        tunnelIp: "10.0.0.2",
        ipv6BypassEnabled: false,
        relayShard: "s3",
      },
    ],
    forwardsByRouter: {
      r1: [
        { id: "web", service: "webfig", publicPort: 20111, status: "active", expiresAt: null },
        { id: "ssh", service: "ssh", publicPort: 39055, status: "active", expiresAt: new Date("2026-09-01T00:00:00.000Z") },
        { id: "old", service: "winbox", publicPort: 10000, status: "revoked", expiresAt: null },
      ],
    },
    auditsByRouter: { r1: [{ id: "a1", action: "link_copied", createdAt: new Date("2026-08-13T10:01:00.000Z") }] },
    replacementByRouter: { r1: null },
    getRelayHost: (shard) => (shard === "s3" ? "s3.example" : "relay.example"),
  });

  assert.deepEqual(projection, [
    {
      id: "r1",
      name: "SHIA-HSPT",
      status: "online",
      lastSyncAt: "2026-08-13T10:00:00.000Z",
      connectionMethod: "vpn",
      tunnelIp: "10.0.0.2",
      ipv6BypassEnabled: false,
      activeForwards: [
        { id: "web", service: "webfig", publicPort: 20111, endpoint: "https://s3.example:20111", expiresAt: null },
        { id: "ssh", service: "ssh", publicPort: 39055, endpoint: "s3.example:39055", expiresAt: "2026-09-01T00:00:00.000Z" },
      ],
      auditEvents: [{ id: "a1", action: "link_copied", createdAt: "2026-08-13T10:01:00.000Z" }],
      replacementStatus: null,
    },
  ]);
});
