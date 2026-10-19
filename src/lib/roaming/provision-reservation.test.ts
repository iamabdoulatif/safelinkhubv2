import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
const org = "00000000-0000-0000-0000-000000000001",
  group = "00000000-0000-0000-0000-000000000002";
const state = globalThis as typeof globalThis & {
  __roamProvision: {
    rows: unknown[][];
    events: string[];
    failed: boolean;
    timeout: boolean;
    created: boolean;
  };
};
const compiled = build({
  entryPoints: ["src/lib/roaming/provision.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "isolated-db-and-router",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^@\/lib\/(db|mikrotik\/(router-sync|voucher-profile-provision|hotspot-login-mode))$/,
          },
          (a) => ({ path: a.path, namespace: "stub" }),
        );
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => {
          let contents = "";
          if (a.path === "@/lib/db")
            contents = `const state=()=>globalThis.__roamProvision;const write=kind=>({values:async()=>{state().events.push(kind)},set:value=>({where:async()=>{state().events.push(kind+':'+value.status)}}),where:async()=>{state().events.push(kind)}});const db={execute:async()=>({rows:[{locked:true}]}),transaction:async f=>f(db),select(){const c={from(){return c},innerJoin(){return c},where(){return c},for(){return c},limit:async()=>state().rows.shift()||[],then(resolve,reject){return Promise.resolve(state().rows.shift()||[]).then(resolve,reject)}};return c},insert:()=>write('reserve'),update:()=>write('update'),delete:()=>write('delete')};export const getDb=()=>db;`;
          else if (a.path.endsWith("/router-sync"))
            contents = `export async function connectToRouter(){const s=globalThis.__roamProvision;s.events.push('connect');return{close(){},async talk(words){if(s.failed)throw Error('router unavailable');if(words[0]==='/ip/hotspot/user/add'){s.created=true;if(s.timeout){s.failed=true;throw Error('reply lost')}return[];}if(words[0]==='/ip/hotspot/user/print')return s.created?[{'.id':'*1',name:'amina'}]:[];return[];}}}`;
          else if (a.path.endsWith("/voucher-profile-provision"))
            contents = "export const ensureVoucherProfileOnRouter=async()=>{};";
          else
            contents =
              'export const ensureMacAutoLogin=async()=>{};export const ROAMING_COOKIE_LIFETIME="1d";';
          return { contents, loader: "js", resolveDir: process.cwd() };
        });
      },
    },
  ],
});
async function api() {
  const b = await compiled,
    m = { exports: {} };
  new Function("require", "module", "exports", b.outputFiles[0].text)(
    createRequire(import.meta.url),
    m,
    m.exports,
  );
  return m.exports as typeof import("./provision");
}
const profile = {
  durationValue: 1,
  durationUnit: "Days",
  uploadMbps: 5,
  downloadMbps: 10,
  defaultPriceCents: 200,
  active: true,
};
const offer = {
  ...profile,
  profileId: "p1",
  priceOverrideCents: null,
  profileActive: true,
};
function reset(timeout = false, changed = false) {
  state.__roamProvision = {
    rows: [
      [{ active: true }],
      [offer],
      [{ router: { id: "r1", name: "FOUANGA" } }],
      [{ id: "r1" }],
      [{ active: true }],
      [changed ? { ...profile, uploadMbps: 20 } : profile],
      [offer],
      [{ active: true }],
      [profile],
      [offer],
    ],
    events: [],
    failed: false,
    timeout,
    created: false,
  };
}
async function run() {
  const a = await api();
  return a.provisionRoamingAccounts({
    orgId: org,
    groupId: group,
    offerId: "o1",
    credentials: [{ username: "amina", password: "demo" }],
    comment: "demo",
    note: null,
    useCase: "Roaming Named User",
  });
}
test("issuance reserves recoverable rows before touching a router", async () => {
  const old = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "isolated-test";
  try {
    reset();
    assert.ok("success" in (await run()));
    const events = state.__roamProvision.events;
    assert.ok(events.indexOf("reserve") < events.indexOf("connect"));
    assert.ok(events.includes("update:PROVISIONED"));
    assert.ok(!events.includes("delete"));
  } finally {
    if (old === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = old;
  }
});
test("lost add reply and failed cleanup retain accounts for recovery", async () => {
  const old = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "isolated-test";
  try {
    reset(true);
    assert.ok("error" in (await run()));
    assert.ok(state.__roamProvision.created);
    assert.ok(
      state.__roamProvision.events.includes("update:PROVISIONING_ERROR"),
    );
    assert.ok(!state.__roamProvision.events.includes("delete"));
  } finally {
    if (old === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = old;
  }
});
test("changed profile is rejected before any router mutation or reservation", async () => {
  reset(false, true);
  assert.ok("error" in (await run()));
  assert.deepEqual(state.__roamProvision.events, []);
});
