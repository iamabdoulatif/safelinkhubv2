import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveOrderRouterId,
  extractBakedRouterId,
  isBakedRouterIdStale,
  type RouterLookups,
} from "./router-resolve";

function lookups(over: Partial<RouterLookups> = {}): RouterLookups {
  return {
    byId: async () => null,
    bySerial: async () => null,
    singleOrgRouter: async () => null,
    ...over,
  };
}

test("id gravé qui résout → chemin rapide, série ignorée", async () => {
  const bySerial = test.mock.fn(async () => "ne-doit-pas-servir");
  const got = await resolveOrderRouterId(
    { routerId: "r-courant", serial: "SN1" },
    lookups({ byId: async (id) => (id === "r-courant" ? "r-courant" : null), bySerial }),
  );
  assert.equal(got, "r-courant");
  assert.equal(bySerial.mock.callCount(), 0);
});

test("id gravé ORPHELIN → repli sur la série (ré-enrôlement)", async () => {
  const got = await resolveOrderRouterId(
    { routerId: "r-mort", serial: "SN1" },
    lookups({ byId: async () => null, bySerial: async (s) => (s === "SN1" ? "r-neuf" : null) }),
  );
  assert.equal(got, "r-neuf");
});

test("id gravé orphelin ET série qui ne résout pas → null (jamais le mauvais routeur)", async () => {
  const single = test.mock.fn(async () => "autre-routeur");
  const got = await resolveOrderRouterId(
    { routerId: "r-mort", serial: "SN1" },
    lookups({ singleOrgRouter: single }),
  );
  assert.equal(got, null);
  // Un id gravé présent = parc multi-routeurs : on ne retombe PAS sur l'unique.
  assert.equal(single.mock.callCount(), 0);
});

test("pas d'id gravé, série connue → série", async () => {
  const got = await resolveOrderRouterId(
    { routerId: "", serial: "SN1" },
    lookups({ bySerial: async () => "r-neuf" }),
  );
  assert.equal(got, "r-neuf");
});

test("pas d'id gravé, pas de série → repli unique routeur de l'org", async () => {
  const got = await resolveOrderRouterId(
    { routerId: "", serial: "" },
    lookups({ singleOrgRouter: async () => "r-unique" }),
  );
  assert.equal(got, "r-unique");
});

test("portail ancien (ni id ni série) sur parc multi-routeurs → null", async () => {
  const got = await resolveOrderRouterId(
    { routerId: "", serial: "" },
    lookups({ singleOrgRouter: async () => null }),
  );
  assert.equal(got, null);
});

// ── extractBakedRouterId / isBakedRouterIdStale ──────────────────────────────

const loginHtml = (routerId: string) =>
  `<body>...</body><script>window.SLH_PORTAL=${JSON.stringify({
    appUrl: "https://safelinkhub.io",
    slug: "acme",
    routerId,
    serial: "SN1",
    mac: "$(mac)",
    countries: [{ d: "+225", f: "🇨🇮", n: "Côte d'Ivoire" }],
  })};window.SLH_PLANS=[];</script>`;

test("extrait le routerId gravé malgré le tableau countries qui suit", () => {
  assert.equal(extractBakedRouterId(loginHtml("r-123")), "r-123");
});

test("login.html sans SLH_PORTAL → null", () => {
  assert.equal(extractBakedRouterId("<html>portail tiers</html>"), null);
});

test("périmé quand l'id gravé diffère de l'id courant", () => {
  assert.equal(isBakedRouterIdStale(loginHtml("r-vieux"), "r-neuf"), true);
});

test("pas périmé quand l'id gravé est le bon", () => {
  assert.equal(isBakedRouterIdStale(loginHtml("r-neuf"), "r-neuf"), false);
});

test("un id gravé vide/absent n'est jamais « périmé » (rien à réparer)", () => {
  assert.equal(isBakedRouterIdStale(loginHtml(""), "r-neuf"), false);
  assert.equal(isBakedRouterIdStale("<html>tiers</html>", "r-neuf"), false);
});
