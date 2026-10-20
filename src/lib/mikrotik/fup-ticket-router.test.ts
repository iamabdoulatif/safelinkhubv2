import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTicketPolicy } from "./fup-ticket-router";
import { DEFAULT_TICKET_POLICY, type TicketStates } from "./fup-ticket-policy";
import type { RouterOSClient } from "./client";
function mock(users: Record<string, string>[]) {
  const calls: string[][] = [];
  return {
    calls,
    client: {
      talk: async (w: string[]) => {
        calls.push(w);
        if (w[0] === "/system/clock/print")
          return [
            { date: "2026-10-20", time: "12:00:00", "gmt-offset": "+00:00" },
          ];
        if (w[0] === "/ip/hotspot/user/print") return users;
        if (w[0] === "/queue/simple/print")
          return [
            {
              ".id": "*q",
              name: "slh-fup-shared",
              comment: "SafeLinkHub FUP v2",
            },
          ];
        return [];
      },
    } as unknown as RouterOSClient,
  };
}
test("video-only sanction preserves account and sessions, arms local reconciliation and aggregates 1M/1M", async () => {
  const { calls, client } = mock([
    { ".id": "*1", name: "a", comment: "vc-date", disabled: "false" },
  ]);
  const state: TicketStates = {
    a: {
      phase: "blocked",
      at: 0,
      until: Date.parse("2026-10-19T12:00:00Z"),
      persistenceMs: 0,
      points: [],
      sessions: {},
    },
  };
  await applyTicketPolicy(client, state, [], DEFAULT_TICKET_POLICY);
  const armed = calls.findIndex((c) => c[0] === "/system/scheduler/add");
  assert.ok(armed >= 0);
  assert.ok(
    calls.some(
      (c) =>
        c[0].startsWith("/system/scheduler/") &&
        c.includes("=interval=5s") &&
        c.includes("=start-date=2026-10-20") &&
        c.includes("=start-time=12:00:00"),
    ),
  );
  assert.ok(
    calls[armed].some(
      (c) => c.startsWith("=comment=") && c.includes("vc-date"),
    ),
  );
  assert.ok(
    !calls.some(
      (c) =>
        c[0] === "/ip/hotspot/user/set" || c[0] === "/ip/hotspot/active/remove",
    ),
  );
  const queue = calls.find((c) => c[0] === "/queue/simple/add");
  assert.ok(queue?.includes("=max-limit=1000000/1000000"));
  assert.ok(
    calls.some(
      (c) =>
        c[0] === "/ip/firewall/filter/add" &&
        c.includes("=out-interface-list=slh-fup-wan"),
    ),
  );
  assert.ok(!calls.some((c) => c.includes("=action=accept")));
});
test("pre-existing disabled ticket is never enabled or adopted", async () => {
  const { calls, client } = mock([
    { ".id": "*1", name: "a", comment: "expired", disabled: "true" },
  ]);
  const state: TicketStates = {
    a: {
      phase: "blocked",
      at: 0,
      until: 9999,
      persistenceMs: 0,
      points: [],
      sessions: {},
    },
  };
  await applyTicketPolicy(client, state, [], DEFAULT_TICKET_POLICY);
  assert.equal(state.a, undefined);
  assert.ok(!calls.some((c) => c[0].endsWith("/set")));
});

test("retry after router-side block and DB rollback preserves blocked recovery and original deadline", async () => {
  const calls: string[][] = [];
  const meta = {
    user: "a",
    id: "*1",
    comment: "vc-date",
    until: 1792411200000,
    blocked: true,
  };
  const client = {
    talk: async (w: string[]) => {
      calls.push(w);
      if (w[0] === "/system/clock/print")
        return [
          { date: "2026-10-20", time: "12:00:00", "gmt-offset": "+00:00" },
        ];
      if (w[0] === "/queue/simple/print")
        return [
          {
            ".id": "*q",
            name: "slh-fup-shared",
            comment: "SafeLinkHub FUP v2",
          },
        ];
      if (w[0] === "/ip/hotspot/user/print")
        return [
          { ".id": "*1", name: "a", comment: "vc-date", disabled: "true" },
        ];
      if (w[0] === "/system/scheduler/print")
        return [
          {
            ".id": "*2",
            name: "slh-fup-ticket-ca978112ca1bbdcafac2",
            comment: "SafeLinkHub FUP ticket v1 " + JSON.stringify(meta),
          },
        ];
      return [];
    },
  } as unknown as RouterOSClient;
  const state: TicketStates = {
    a: {
      phase: "throttle",
      at: 0,
      until: 1792411300000,
      persistenceMs: 0,
      points: [],
      sessions: {},
    },
  };
  await applyTicketPolicy(client, state, [], DEFAULT_TICKET_POLICY);
  assert.equal(state.a.phase, "blocked");
  assert.equal(state.a.until, meta.until);
  assert.ok(
    calls.some(
      (w) => w[0] === "/ip/hotspot/user/set" && w.includes("=disabled=no"),
    ),
  );
  assert.ok(!calls.some((w) => w[0] === "/ip/hotspot/active/remove"));
  assert.ok(
    calls
      .find((w) => w[0] === "/system/scheduler/set")
      ?.some((w) => w.startsWith("=comment=") && w.includes("video")),
  );
});

test("replacement account with same username never inherits an old native block", async () => {
  const calls: string[][] = [];
  const meta = {
    user: "a",
    id: "*1",
    comment: "old",
    until: 1792411200000,
    blocked: true,
  };
  const client = {
    talk: async (w: string[]) => {
      calls.push(w);
      if (w[0] === "/system/clock/print")
        return [
          { date: "2026-10-20", time: "12:00:00", "gmt-offset": "+00:00" },
        ];
      if (w[0] === "/queue/simple/print")
        return [
          {
            ".id": "*q",
            name: "slh-fup-shared",
            comment: "SafeLinkHub FUP v2",
          },
        ];
      if (w[0] === "/ip/hotspot/user/print")
        return [{ ".id": "*3", name: "a", comment: "new", disabled: "false" }];
      if (w[0] === "/system/scheduler/print")
        return [
          {
            ".id": "*2",
            name: "slh-fup-ticket-ca978112ca1bbdcafac2",
            comment: "SafeLinkHub FUP ticket v1 " + JSON.stringify(meta),
          },
        ];
      return [];
    },
  } as unknown as RouterOSClient;
  const state: TicketStates = {
    a: {
      phase: "blocked",
      at: 0,
      until: 1792411200000,
      persistenceMs: 0,
      points: [],
      sessions: {},
    },
  };
  await applyTicketPolicy(client, state, [], DEFAULT_TICKET_POLICY);
  assert.equal(state.a, undefined);
  assert.ok(!calls.some((w) => w[0] === "/ip/hotspot/user/set"));
  assert.ok(calls.some((w) => w[0] === "/system/scheduler/remove"));
});

test("multiple sessions share a single 1M/1M queue and keep original account profiles", async () => {
  const { calls, client } = mock([
    { ".id": "*1", name: "a", comment: "valid", disabled: "false" },
  ]);
  const state: TicketStates = {
    a: {
      phase: "blocked",
      at: 0,
      until: Date.parse("2026-10-21T12:00:00Z"),
      persistenceMs: 0,
      points: [],
      sessions: {},
    },
  };
  await applyTicketPolicy(
    client,
    state,
    [
      { user: "a", address: "10.0.0.2", mac: "a", bytesIn: 0, bytesOut: 0 },
      { user: "a", address: "10.0.0.3", mac: "b", bytesIn: 0, bytesOut: 0 },
    ],
    DEFAULT_TICKET_POLICY,
  );
  const queues = calls.filter((w) => w[0] === "/queue/simple/add");
  assert.equal(queues.length, 1);
  assert.ok(queues[0].includes("=target=10.0.0.2/32,10.0.0.3/32"));
  assert.ok(queues[0].includes("=max-limit=1000000/1000000"));
  assert.ok(!calls.some((w) => w[0].includes("/user/profile/")));
});
test("release of video-only sanction never re-enables a manually disabled account", async () => {
  const calls: string[][] = [];
  const meta = {
    user: "a",
    id: "*1",
    comment: "valid",
    until: 1792500000000,
    blocked: false,
    video: true,
  };
  const client = {
    talk: async (w: string[]) => {
      calls.push(w);
      if (w[0] === "/ip/hotspot/user/print")
        return [{ ".id": "*1", name: "a", comment: "valid", disabled: "true" }];
      if (w[0] === "/system/scheduler/print")
        return [
          {
            ".id": "*s",
            name: "slh-fup-ticket-ca978112ca1bbdcafac2",
            comment: "SafeLinkHub FUP ticket v1 " + JSON.stringify(meta),
          },
        ];
      return [];
    },
  } as unknown as RouterOSClient;
  await applyTicketPolicy(client, {}, [], DEFAULT_TICKET_POLICY);
  assert.ok(!calls.some((w) => w[0] === "/ip/hotspot/user/set"));
  assert.ok(calls.some((w) => w[0] === "/system/scheduler/remove"));
});
test("release tolerates sanctions expiring between inventory and cleanup", async () => {
  const calls: string[][] = [];
  const name = "slh-fup-ticket-ca978112ca1bbdcafac2";
  const client = {
    talk: async (words: string[]) => {
      calls.push(words);
      if (words[0] === "/system/scheduler/print") return [{
        ".id": "*s", name,
        comment: "SafeLinkHub FUP ticket v1 " + JSON.stringify({
          user: "a", id: "*1", comment: "valid", until: 1792500000000,
          blocked: false, video: true,
        }),
      }];
      if (words[0] === "/queue/simple/print") return [{
        ".id": "*q", name, comment: "SafeLinkHub FUP ticket v1",
      }];
      if (words[0].endsWith("/remove")) throw new Error("no such item (4)");
      return [];
    },
  } as unknown as RouterOSClient;
  await applyTicketPolicy(client, {}, [], { ...DEFAULT_TICKET_POLICY, enabled: false });
  assert.ok(calls.some(w => w[0] === "/queue/simple/remove"));
  assert.ok(calls.some(w => w[0] === "/system/scheduler/remove"));
});

test("missing shared FUP queue prevents video exception installation", async () => {
  const calls: string[][] = [];
  const client = {
    talk: async (w: string[]) => {
      calls.push(w);
      return w[0] === "/ip/hotspot/user/print"
        ? [{ ".id": "*1", name: "a", disabled: "false", comment: "" }]
        : [];
    },
  } as unknown as RouterOSClient;
  await assert.rejects(
    () =>
      applyTicketPolicy(
        client,
        {
          a: {
            phase: "blocked",
            at: 0,
            until: 1792500000000,
            persistenceMs: 0,
            points: [],
            sessions: {},
          },
        },
        [],
        DEFAULT_TICKET_POLICY,
      ),
    /Plafond partagé/,
  );
  assert.ok(!calls.some((w) => w[0].endsWith("/add")));
});
