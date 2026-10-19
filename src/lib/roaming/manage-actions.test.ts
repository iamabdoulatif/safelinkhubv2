import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
const org = "00000000-0000-0000-0000-000000000001",
  id = "00000000-0000-0000-0000-000000000002";
const context = globalThis as typeof globalThis & {
  __roamManage: {
    session: unknown;
    rows: unknown[][];
    writes: unknown[];
    filters: unknown[][];
  };
};
const compiled = build({
  entryPoints: ["src/lib/roaming/manage-actions.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "isolate",
      setup(b) {
        b.onResolve(
          { filter: /^@\/lib\/(db|auth\/session)$|^next\/cache$/ },
          (a) => ({ path: a.path, namespace: "stub" }),
        );
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
          contents:
            a.path === "next/cache"
              ? "export const revalidatePath=()=>{};"
              : a.path.endsWith("/session")
                ? "export const requireAdminSession=async()=>globalThis.__roamManage.session;"
                : `import{PgDialect}from'drizzle-orm/pg-core';const state=()=>globalThis.__roamManage;const filter=f=>state().filters.push(new PgDialect().sqlToQuery(f).params);const db={transaction:async f=>f(db),select(){const c={from(){return c},where(f){filter(f);return c},for(){return c},limit:async()=>state().rows.shift()||[]};return c},update(){return{set(v){state().writes.push(v);return{where:async f=>{filter(f)}}}}},delete(){return{where:async f=>{filter(f);state().writes.push('delete')}}}};export const getDb=()=>db;`,
          loader: "js",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
async function api() {
  const r = await compiled,
    m = { exports: {} };
  new Function("require", "module", "exports", r.outputFiles[0].text)(
    createRequire(import.meta.url),
    m,
    m.exports,
  );
  return m.exports as typeof import("./manage-actions");
}
function reset(rows: unknown[][] = [], session: unknown = { orgId: org }) {
  context.__roamManage = { session, rows, writes: [], filters: [] };
}
function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
const profile = {
  id,
  name: "01-JOUR",
  durationValue: 1,
  durationUnit: "Days",
  uploadMbps: 5,
  downloadMbps: 10,
  defaultPriceCents: 200,
};
test("management refuses anonymous calls before database access", async () => {
  reset([], null);
  const a = await api();
  for (const fn of [
    a.updateRoamingGroup,
    a.updateRoamingProfile,
    a.deleteRoamingProfile,
    a.updateRoamingOffer,
  ])
    assert.ok((await fn(undefined, form({ id }))).error);
  assert.deepEqual(context.__roamManage.writes, []);
});
test("foreign organization objects cannot be edited or deleted", async () => {
  const a = await api();
  for (const fn of [
    a.updateRoamingGroup,
    a.deleteRoamingProfile,
    a.updateRoamingOffer,
  ]) {
    reset([[]]);
    assert.ok(
      (
        await fn(
          undefined,
          form({ id, name: "Nouveau nom", priceOverrideCents: "0" }),
        )
      ).error,
    );
    assert.deepEqual(context.__roamManage.writes, []);
    assert.ok(context.__roamManage.filters.some((p) => p.includes(org)));
  }
});
test("profile with an offer cannot be deleted or structurally edited", async () => {
  const a = await api();
  reset([[profile], [{ id }]]);
  assert.ok((await a.deleteRoamingProfile(undefined, form({ id }))).error);
  assert.deepEqual(context.__roamManage.writes, []);
  reset([[profile], [{ id }]]);
  assert.ok(
    (
      await a.updateRoamingProfile(
        undefined,
        form({
          id,
          durationValue: "1",
          durationUnit: "Days",
          uploadMbps: "8",
          downloadMbps: "10",
          defaultPriceCents: "300",
        }),
      )
    ).error,
  );
  assert.deepEqual(context.__roamManage.writes, []);
});
test("price-only update preserves the structure of an already used profile", async () => {
  reset([[profile]]);
  const a = await api();
  assert.ok(
    "success" in
      (await a.updateRoamingProfile(
        undefined,
        form({
          id,
          durationValue: "1",
          durationUnit: "Days",
          uploadMbps: "5",
          downloadMbps: "10",
          defaultPriceCents: "300",
        }),
      )),
  );
  assert.equal(context.__roamManage.writes.length, 1);
});
test("offer keeps its pause state and accepts a free price override", async () => {
  reset([[{ id, active: false }]]);
  const a = await api();
  assert.ok(
    "success" in
      (await a.updateRoamingOffer(
        undefined,
        form({ id, priceOverrideCents: "0" }),
      )),
  );
  assert.deepEqual(context.__roamManage.writes, [{ priceOverrideCents: 0 }]);
});
test("profile without dependencies is deletable; historical vouchers prevent deletion", async () => {
  const a = await api();
  reset([[profile], [], []]);
  assert.ok(
    "success" in (await a.deleteRoamingProfile(undefined, form({ id }))),
  );
  reset([[profile], [], [{ id }]]);
  assert.ok((await a.deleteRoamingProfile(undefined, form({ id }))).error);
  assert.deepEqual(context.__roamManage.writes, []);
});
