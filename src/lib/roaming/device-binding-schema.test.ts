import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("la liaison d'appareil conserve un état unique par compte et par zone", async () => {
  const [schema, migration] = await Promise.all([
    read("src/lib/db/schema.ts"),
    read("scripts/add-roaming-device-bindings.sql"),
  ]);

  assert.match(schema, /export const roamingDeviceBindings = pgTable\(\s*"roaming_device_bindings"/);
  assert.match(schema, /export const roamingDeviceBindingRouters = pgTable\(\s*"roaming_device_binding_routers"/);
  assert.match(migration, /unique \(voucher_id\)/i);
  assert.match(migration, /unique \(binding_id, router_id\)/i);
  assert.match(migration, /check \(status in \('PENDING', 'SYNCED', 'ERROR'\)\)/i);
});
