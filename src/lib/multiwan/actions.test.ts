import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { defaultMultiwanConfig } from "./config";
const id = "00000000-0000-0000-0000-000000000001",
  org = "00000000-0000-0000-0000-000000000002";
const globals = globalThis as typeof globalThis & {
  __mwTest: {
    session: unknown;
    filters: unknown[][];
    updates: number;
    licensed: boolean;
  };
};
const compiled = build({
  entryPoints: ["src/lib/multiwan/actions.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "isolate",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^@\/lib\/(db(\/schema)?|auth\/(session|roles)|wallet\/balance)$/,
          },
          (a) => ({ path: a.path, namespace: "stub" }),
        );
        b.onResolve({ filter: /^\.\/payment$/ }, (a) => ({
          path: a.path,
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => {
          let contents = "";
          if (a.path.endsWith("session"))
            contents =
              "export const getSession=async()=>globalThis.__mwTest.session;";
          else if (a.path.endsWith("roles"))
            contents =
              'export const can=role=>["admin","editor","superadmin"].includes(role);';
          else if (a.path.endsWith("schema"))
            contents = [
              "routers",
              "bridges",
              "routerMultiwanLicenses",
              "safecoinAccounts",
              "safecoinSettings",
            ]
              .map(
                (n) =>
                  `export const ${n}={name:'${n}',id:'id',routerId:'router_id',orgId:'org_id'};`,
              )
              .join("");
          else if (a.path === "@/lib/db")
            contents = `import{PgDialect}from'drizzle-orm/pg-core';const db={transaction:async task=>task(db),select(){return{from(table){const rows=()=>table.name==='routers'?[{id:'${id}',name:'router'}]:globalThis.__mwTest.licensed?[{id:'license'}]:[];const chain={where(filter){globalThis.__mwTest.filters.push(new PgDialect().sqlToQuery(filter).params);return chain;},limit:async()=>rows(),for:async()=>rows()};return chain;}}},update(){globalThis.__mwTest.updates++;throw Error('No write expected');}};export const getDb=()=>db;`;
          else if (a.path.endsWith("payment"))
            contents =
              'export const purchaseMultiwan=async()=>{throw Error("No real purchase allowed");};';
          else contents = "export const getWalletBalanceCents=async()=>0;";
          return { contents, loader: "js", resolveDir: process.cwd() };
        });
      },
    },
  ],
});
async function api() {
  const built = await compiled;
  const evaluated = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(
    createRequire(import.meta.url),
    evaluated,
    evaluated.exports,
  );
  return evaluated.exports as typeof import("./actions");
}
function reset(role: string | null, licensed = false) {
  globals.__mwTest = {
    session: role ? { orgId: org, userId: id, role } : null,
    filters: [],
    updates: 0,
    licensed,
  };
}
test("anonymous callers receive no script or billing access", async () => {
  reset(null);
  const a = await api();
  assert.ok((await a.generatePaidMultiwan(id, defaultMultiwanConfig())).error);
  assert.ok((await a.payMultiwanPremium(id, "wallet", 100)).error);
  assert.deepEqual(globals.__mwTest.filters, []);
});
test("viewer cannot generate or purchase even with a licence", async () => {
  reset("viewer", true);
  const a = await api();
  assert.ok((await a.generatePaidMultiwan(id, defaultMultiwanConfig())).error);
  assert.ok((await a.payMultiwanPremium(id, "wallet", 100)).error);
  assert.equal(globals.__mwTest.updates, 0);
});
test("unpaid router never receives script and licence checks stay scoped to organization", async () => {
  reset("admin");
  const r = await (
    await api()
  ).generatePaidMultiwan(id, defaultMultiwanConfig());
  assert.ok(r.error);
  assert.equal("script" in r, false);
  assert.equal(globals.__mwTest.updates, 0);
  assert.ok(globals.__mwTest.filters.every((params) => params.includes(org)));
});
