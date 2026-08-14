import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
