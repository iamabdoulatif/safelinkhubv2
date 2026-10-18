import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceTrafficHistory,
  trafficBucket,
  observedPeriods,
  validateIncident,
  validateHistoryRange,
  privateGraphPrefix,
  type TrafficObservation,
} from "./traffic-history";
const observation = (at: number, rx = 1000, tx = 500): TrafficObservation => ({
  at,
  uptime: at / 1000,
  links: [
    {
      id: "wan1",
      name: "Starlink 1",
      interface: "ether1",
      rx,
      tx,
      running: true,
    },
  ],
  clients: { a: 100, b: 200 },
  conditions: [],
});

test("rates use actual elapsed time, RX and TX stay separate", () => {
  const first = advanceTrafficHistory(null, observation(300000));
  assert.equal(first.sample.links[0].rxMbps, null);
  const next = advanceTrafficHistory(
    first.state,
    observation(600000, 30001000, 60000500),
  );
  assert.equal(next.sample.links[0].rxBytes, 30000000);
  assert.equal(next.sample.links[0].txMbps, 1.6);
  assert.equal(next.sample.connected, 2);
  assert.equal(next.sample.exchanging, 0);
});
test("active sessions count only counter growth; new session is observed", () => {
  const first = advanceTrafficHistory(null, observation(300000));
  const current = {
    ...observation(600000),
    clients: { a: 101, b: 200, c: 20 },
  };
  assert.equal(
    advanceTrafficHistory(first.state, current).sample.exchanging,
    2,
  );
});
test("reboot or counters decreasing never invents a delta", () => {
  const previous = advanceTrafficHistory(null, observation(300000));
  const reset = { ...observation(600000, 2, 1), uptime: 3 };
  const result = advanceTrafficHistory(previous.state, reset);
  assert.equal(result.sample.links[0].quality, "reset");
  assert.equal(result.sample.links[0].rxBytes, null);
  assert.equal(result.sample.exchanging, null);
});
test("unreadable link is unknown, missing interval is never filled with zero", () => {
  const previous = advanceTrafficHistory(null, observation(300000));
  const missing = {
    ...observation(600000),
    clients: null,
    links: [{ ...observation(0).links[0], rx: null, tx: null, running: null }],
  };
  const failure = advanceTrafficHistory(previous.state, missing);
  assert.equal(failure.sample.links[0].quality, "missing");
  const later = advanceTrafficHistory(
    failure.state,
    observation(1200000, 2000, 1000),
  );
  assert.equal(later.sample.links[0].rxBytes, 1000);
  assert.equal(later.sample.links[0].rxMbps, null);
  assert.equal(later.sample.links[0].quality, "gap");
  assert.equal(later.sample.exchanging, null);
});
test("a renamed/reassigned WAN cannot reuse an old interface baseline", () => {
  const first = advanceTrafficHistory(null, observation(300000));
  const next = observation(600000);
  next.links[0].interface = "ether2";
  assert.equal(
    advanceTrafficHistory(first.state, next).sample.links[0].rxBytes,
    null,
  );
});
test("duplicate or backwards timestamps cannot advance the baseline", () => {
  const first = advanceTrafficHistory(null, observation(300000));
  assert.throws(() => advanceTrafficHistory(first.state, observation(300000)));
  assert.throws(() => advanceTrafficHistory(first.state, observation(299000)));
  assert.equal(trafficBucket(599999), 300000);
});
test("measured periods do not bridge a telemetry gap", () => {
  const o = observation(300000);
  o.conditions = [
    {
      kind: "fup",
      source: "safelinkhub",
      certainty: "confirmed",
      evidence: "File lue sur MikroTik",
    },
  ];
  const samples = [300000, 600000, 1500000].map(
    (at) => advanceTrafficHistory(null, { ...o, at }).sample,
  );
  const periods = observedPeriods(samples);
  assert.equal(periods.length, 2);
  assert.equal(periods[0].end, 600000);
  assert.equal(periods[1].start, 1500000);
});
test("incident validation requires evidence and correct bounds; rates never declare Starlink FUP", () => {
  const incident = {
    linkId: "wan1",
    kind: "fup",
    source: "starlink",
    certainty: "confirmed",
    evidence: "",
    start: 1000,
    end: 2000,
  };
  assert.ok(validateIncident(incident, 3000));
  assert.equal(
    validateIncident(
      { ...incident, evidence: "Relevé du compte Starlink" },
      3000,
    ),
    null,
  );
  assert.ok(
    validateIncident({ ...incident, evidence: "Preuve", end: 500 }, 3000),
  );
  assert.deepEqual(
    advanceTrafficHistory(null, observation(300000, 0, 0)).sample.conditions,
    [],
  );
});
test("query bounds and management graph access reject unbounded or public inputs", () => {
  assert.equal(validateHistoryRange(1000, 301000, 500000), null);
  assert.ok(validateHistoryRange(0, 40 * 86400000, 40 * 86400000));
  assert.equal(privateGraphPrefix("10.20.0.0/24"), true);
  assert.equal(privateGraphPrefix("0.0.0.0/0"), false);
  assert.equal(privateGraphPrefix("10.0.0.0/7"), false);
  assert.equal(privateGraphPrefix("192.168.1.1/32"), true);
});

test("chart buckets preserve missing intervals and do not dilute measured rates with zeros", async () => {
  const { trafficChart } = await import("./traffic-history");
  const state = advanceTrafficHistory(null, observation(300000)).state;
  const sample = advanceTrafficHistory(
    state,
    observation(600000, 30001000, 500),
  ).sample;
  const points = trafficChart([sample], "wan1", 300000, 1200000, 300000);
  assert.equal(points.length, 3);
  assert.equal(points[0].rxMbps, null);
  assert.equal(points[1].rxMbps, 0.8);
  assert.equal(points[2].rxMbps, null);
});

test("unreadable uptime and previously unreadable session counters do not imply activity", () => {
  const first = advanceTrafficHistory(null, {
    ...observation(300000),
    clients: { a: null },
  });
  assert.equal(
    advanceTrafficHistory(first.state, {
      ...observation(600000),
      clients: { a: 200 },
    }).sample.exchanging,
    null,
  );
  const unknown = { ...observation(600000, 2000, 1000), uptime: null };
  assert.equal(
    advanceTrafficHistory(first.state, unknown).sample.links[0].rxMbps,
    null,
  );
});
