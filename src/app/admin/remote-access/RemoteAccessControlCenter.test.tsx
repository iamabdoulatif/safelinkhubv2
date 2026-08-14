import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RemoteAccessControlCenter from "./RemoteAccessControlCenter";

const routers = [
  {
    id: "r1",
    name: "SHIA-HSPT",
    status: "online",
    lastSyncAt: "2026-08-13T10:00:00.000Z",
    connectionMethod: "vpn",
    tunnelIp: "10.0.0.2",
    ipv6BypassEnabled: false,
    activeForwards: [
      {
        id: "f1",
        service: "webfig",
        publicPort: 20111,
        endpoint: "https://s3.example:20111",
        expiresAt: null,
      },
    ],
    auditEvents: [],
    replacementStatus: null,
  },
];

test("rend les métriques, la recherche et le détail", () => {
  const markup = renderToStaticMarkup(
    <RemoteAccessControlCenter
      routers={routers}
      temporaryPassCount={0}
      temporaryPassExpiresAt={null}
    />,
  );

  assert.match(markup, /Routeurs en ligne/);
  assert.match(markup, /Rechercher un routeur, un accès ou un endpoint/);
  assert.match(markup, /SHIA-HSPT/);
  assert.match(markup, /https:\/\/s3\.example:20111/);
});

test("affiche le CTA tunnel quand le parc est vide", () => {
  const markup = renderToStaticMarkup(
    <RemoteAccessControlCenter
      routers={[]}
      temporaryPassCount={0}
      temporaryPassExpiresAt={null}
    />,
  );

  assert.match(markup, /Aucun routeur configuré/);
  assert.match(markup, /Installer un tunnel/);
});
