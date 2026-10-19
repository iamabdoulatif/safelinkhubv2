import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import UsersDirectoryRow from "./UsersDirectoryRow";
import type { UserControlRow } from "./users-control-center";
const row: UserControlRow = {
  id: "u1",
  name: "Awa Koné",
  email: "awa@example.com",
  orgId: "o1",
  orgName: "Réseau Centre",
  role: "admin",
  quotaCategory: "paid",
  quotaLabel: "VPN payant",
  quotaExpiresAt: null,
  createdAt: "2026-10-01",
};
test("every supported role is explicit in the directory, including ordinary admins", () => {
  for (const [role, label] of [
    ["admin", "Administrateur"],
    ["editor", "Éditeur"],
    ["viewer", "Lecteur"],
    ["sales_agent", "Agent de vente"],
    ["superadmin", "Superadmin"],
  ]) {
    const html = renderToStaticMarkup(
      <UsersDirectoryRow
        row={{ ...row, role }}
        superadmin
        now={new Date("2026-10-19")}
        onOpen={() => {}}
      />,
    );
    assert.ok(html.includes(label));
    assert.match(html, /Ouvrir le détail de Awa Koné/);
  }
});
test("VPN quota metadata is absent from a regular member view", () => {
  const html = renderToStaticMarkup(
    <UsersDirectoryRow
      row={row}
      superadmin={false}
      now={new Date("2026-10-19")}
      onOpen={() => {}}
    />,
  );
  assert.doesNotMatch(html, /VPN payant/);
  assert.match(html, /Administrateur/);
});
