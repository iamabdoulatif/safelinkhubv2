import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { join } from "node:path";

// Execute the real server-action code with auth/storage boundaries stubbed;
// none of these tests can contact a router or the application's database.
const root = process.cwd();
const sandbox = globalThis as typeof globalThis & {
  __trafficActionTest: { session: unknown; router: unknown; touched: string[] };
};
const id = "00000000-0000-0000-0000-000000000001";
const compiled = build({
  entryPoints: [join(root, "src/lib/mikrotik/traffic-actions.ts")],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "auth-boundaries",
      setup(b) {
        b.onResolve(
          { filter: /^@\/lib\/(auth\/(session|roles)|db(\/schema)?)$/ },
          (a) => ({ path: a.path, namespace: "boundaries" }),
        );
        b.onResolve(
          { filter: /^\.\/(router-sync|traffic-reader|traffic-collector)$/ },
          (a) => ({ path: a.path, namespace: "boundaries" }),
        );
        b.onLoad({ filter: /.*/, namespace: "boundaries" }, (a) => {
          let contents = "";
          if (a.path.endsWith("/session"))
            contents =
              'export async function getSession(){return globalThis.__trafficActionTest.session;} export const isSuperAdmin=r=>r==="superadmin";';
          else if (a.path.endsWith("/roles"))
            contents =
              'export const can=r=>["admin","editor","superadmin"].includes(r);';
          else if (a.path.endsWith("/schema"))
            contents = [
              "routers",
              "routerRegulation",
              "routerTrafficIncidents",
              "routerTrafficSamples",
              "routerTrafficState",
            ]
              .map(
                (name) =>
                  `export const ${name}={id:'${name}.id',routerId:'${name}.routerId'};`,
              )
              .join("");
          else if (a.path === "@/lib/db")
            contents = `export function getDb(){return {select(){return {from(table){globalThis.__trafficActionTest.touched.push(table.id);return {where(){return {limit:async()=>[globalThis.__trafficActionTest.router]}}}}}}}};`;
          else if (a.path.endsWith("router-sync"))
            contents =
              'export const connectToRouter=()=>{throw Error("Router operation forbidden in auth test");};';
          else if (a.path.endsWith("traffic-reader"))
            contents =
              'export const enableTrafficGraphing=()=>{throw Error("Router operation forbidden in auth test");};';
          else contents = "export const configuredTrafficLinks=()=>[];";
          return { contents, loader: "js" };
        });
      },
    },
  ],
});
async function actions() {
  const output = await compiled;
  const evaluatedModule = { exports: {} };
  new Function("require", "module", "exports", output.outputFiles[0].text)(
    createRequire(import.meta.url),
    evaluatedModule,
    evaluatedModule.exports,
  );
  return evaluatedModule.exports as typeof import("./traffic-actions");
}

test("anonymous history requests never query storage", async () => {
  sandbox.__trafficActionTest = { session: null, router: null, touched: [] };
  const result = await (
    await actions()
  ).readRouterTrafficHistory(id, 1000, 2000);
  assert.ok(result.error);
  assert.deepEqual(sandbox.__trafficActionTest.touched, []);
});
test("another organization's router exposes neither history nor export", async () => {
  sandbox.__trafficActionTest = {
    session: { orgId: "org-a", role: "admin" },
    router: { id, orgId: "org-b" },
    touched: [],
  };
  const api = await actions();
  assert.ok((await api.readRouterTrafficHistory(id, 1000, 2000)).error);
  assert.ok((await api.exportRouterTrafficHistory(id, 1000, 2000)).error);
  assert.deepEqual(sandbox.__trafficActionTest.touched, [
    "routers.id",
    "routers.id",
  ]);
});
test("viewer cannot record incidents or enable graphing", async () => {
  sandbox.__trafficActionTest = {
    session: { orgId: "org-a", role: "viewer" },
    router: { id, orgId: "org-a" },
    touched: [],
  };
  const api = await actions();
  assert.ok((await api.activateRouterTrafficGraphing(id, "10.0.0.0/24")).error);
  assert.ok((await api.recordTrafficIncident(id, {} as never)).error);
  assert.deepEqual(sandbox.__trafficActionTest.touched, []);
});
test("history rejects huge ranges before reading the samples", async () => {
  sandbox.__trafficActionTest = {
    session: { orgId: "org-a", role: "admin" },
    router: { id, orgId: "org-a" },
    touched: [],
  };
  const api = await actions();
  assert.ok((await api.readRouterTrafficHistory(id, 0, 40 * 86400000)).error);
  assert.deepEqual(sandbox.__trafficActionTest.touched, ["routers.id"]);
});
