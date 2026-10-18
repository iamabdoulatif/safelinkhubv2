import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateMultiwanScript,
  validateMultiwan,
  defaultMultiwanConfig,
  MULTIWAN_PRICE_FCFA,
} from "./generator";
const id = "00000000-0000-0000-0000-000000000001";

test("price is 15000 FCFA and validation rejects injection, duplicates and incomplete WANs", () => {
  assert.equal(MULTIWAN_PRICE_FCFA, 15000);
  const config = defaultMultiwanConfig();
  assert.equal(validateMultiwan(config), null);
  assert.ok(
    validateMultiwan({
      ...config,
      lanInterface: 'ether1"; /system reset-configuration',
    }),
  );
  assert.ok(
    validateMultiwan({ ...config, wans: [config.wans[0], config.wans[0]] }),
  );
  assert.ok(validateMultiwan({ ...config, wans: [config.wans[0]] }));
  assert.ok(validateMultiwan({ ...config, lanCidr: "0.0.0.0/0" }));
  assert.ok(
    validateMultiwan({
      ...config,
      wans: config.wans.map((w) => ({ ...w, gateway: "999.1.1.1" })),
    }),
  );
});
test("all 2–6 WAN / OS6–7 / failover modes produce distinct syntax and every PCC table has backups", () => {
  for (const version of ["6", "7"] as const)
    for (const failover of ["local", "recursive", "hybrid"] as const)
      for (let count = 2; count <= 6; count++) {
        const c = defaultMultiwanConfig(count);
        c.version = version;
        c.failover = failover;
        const script = generateMultiwanScript(id, c);
        assert.match(script, /per-connection-classifier=both-addresses/);
        assert.ok(script.includes(`:${count}/${count - 1}`));
        assert.ok(script.includes("connection-mark=no-mark"));
        assert.ok(
          script.indexOf("Hotspot") < script.indexOf("/ip firewall nat add"),
        );
        assert.ok(
          script.indexOf("FastTrack") < script.indexOf("/ip firewall nat add"),
        );
        assert.ok(script.includes(`distance=${count}`));
        if (version === "7") {
          assert.match(script, /routing table add/);
          assert.match(script, /routing-table=/);
          assert.ok(!script.includes(' routing-mark="slh'));
        } else {
          assert.ok(!script.includes("/routing table"));
          assert.match(script, /routing-mark=/);
        }
        if (failover === "hybrid") {
          assert.match(script, /149\.112\.112\.112\/32/);
          assert.match(script, /scope=10 check-gateway=ping/);
        }
        if (failover === "local")
          assert.ok(!script.includes("scope=10 check-gateway=ping"));
        assert.ok(!script.includes("/ip dns set"));
        assert.ok(!script.includes("/ip firewall filter remove"));
      }
});
test("Hotspot mode has default-table failover and no PCC or FastTrack mutation", () => {
  const c = { ...defaultMultiwanConfig(), network: "hotspot" as const };
  const s = generateMultiwanScript(id, c);
  assert.ok(!s.includes("per-connection-classifier="));
  assert.ok(!s.includes("/routing table add"));
  assert.ok(!s.includes("/ip firewall filter set"));
  assert.match(s, /table principale/);
});
test("probe collisions and gateway in the LAN are rejected", () => {
  const c = defaultMultiwanConfig();
  c.wans[1].probe = c.wans[0].probe;
  assert.ok(validateMultiwan(c));
  const d = defaultMultiwanConfig();
  d.wans[0].gateway = "192.168.88.1";
  assert.ok(validateMultiwan(d));
});
test("identifiers are router scoped and rollback removes only owned objects", () => {
  const s = generateMultiwanScript(id, defaultMultiwanConfig());
  const other = generateMultiwanScript(
    "10000000-0000-0000-0000-000000000001",
    defaultMultiwanConfig(),
  );
  assert.notEqual(s, other);
  assert.match(s, /RETRAIT/);
  assert.ok(!s.includes("remove [find]"));
  assert.throws(() => generateMultiwanScript("bad", defaultMultiwanConfig()));
});

test("module exclusions preserve other mangle rules and conflicting defaults abort before mutation", () => {
  const script = generateMultiwanScript(id, defaultMultiwanConfig());
  assert.ok(!script.includes(" action=accept"));
  assert.ok(script.includes("dst-address-list=!"));
  assert.ok(
    script.indexOf("Routes par défaut concurrentes") <
      script.indexOf("remove [find"),
  );
});
