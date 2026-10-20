import { test } from "node:test";
import assert from "node:assert/strict";
import {
  videoSessionScript,
  ensureVideoDestinations,
  VIDEO_DOMAINS,
} from "./fup-ticket-video";
import type { RouterOSClient } from "./client";
test("local reconciliation binds all sessions to ticket identity and stable expiry, without changing profiles or disabling accounts", () => {
  const s = videoSessionScript({
    user: "ticket-$a",
    id: "*AB",
    comment: "vc-date",
    until: Date.parse("2026-10-21T13:00:00Z"),
    name: "slh-fup-ticket-abc",
    schedulerComment: "metadata",
    cleanup: "CLEANUP",
  });
  assert.match(s, /\/ip hotspot active find where user=/);
  assert.match(s, /\/ip hotspot user get \$u comment/);
  assert.match(s, /20261021/);
  assert.match(s, /130000/);
  assert.match(s, /CLEANUP/);
  assert.match(s, /target=\$targets/);
  assert.match(s, /timeout=10s/);
  assert.doesNotMatch(s, /\$addresses/);
  assert.match(s, /\*ab/);
  assert.doesNotMatch(s, /\/ip hotspot user set|\/ip hotspot user profile/);
  assert.match(s, /disabled=yes/); // queue is disabled before changing its targets
});
test("DNS list uses exact domain boundaries and never broadly grants all Google/ByteDance addresses", async () => {
  const calls: string[][] = [];
  const c = {
    talk: async (w: string[]) => {
      calls.push(w);
      if (w[0] === "/system/clock/print")
        return [
          { date: "2026-10-20", time: "12:00:00", "gmt-offset": "+00:00" },
        ];
      return [];
    },
  } as unknown as RouterOSClient;
  await ensureVideoDestinations(c);
  assert.ok(VIDEO_DOMAINS.includes("googlevideo.com"));
  assert.ok(VIDEO_DOMAINS.includes("tiktok.com"));
  assert.ok(!VIDEO_DOMAINS.includes("google.com"));
  assert.ok(!VIDEO_DOMAINS.includes("googleapis.com"));
  assert.ok(
    calls.some(
      (w) => w.includes("=match-subdomain=yes") && w.includes("=type=FWD"),
    ),
  );
  assert.ok(!calls.some((w) => w.includes("=action=accept")));
});
test("DNS conflicts are rejected before mutating another owner", async () => {
  const calls: string[][] = [];
  const c = {
    talk: async (w: string[]) => {
      calls.push(w);
      if (w[0] === "/system/clock/print")
        return [
          { date: "2026-10-20", time: "12:00:00", "gmt-offset": "+00:00" },
        ];
      return w[0] === "/ip/dns/static/print"
        ? [
            {
              ".id": "*1",
              name: "youtube.com",
              type: "NXDOMAIN",
              comment: "Other owner",
            },
          ]
        : [];
    },
  } as unknown as RouterOSClient;
  await assert.rejects(() => ensureVideoDestinations(c), /DNS/);
  assert.ok(
    !calls.some((w) => w[0].endsWith("/set") || w[0].endsWith("/remove")),
  );
});

test("unreadable router clock prevents any network change", async () => {
  const calls: string[][] = [];
  const c = {
    talk: async (w: string[]) => {
      calls.push(w);
      return [];
    },
  } as unknown as RouterOSClient;
  await assert.rejects(() => ensureVideoDestinations(c), /Horloge/);
  assert.ok(!calls.some((w) => w[0].endsWith("/add")));
});
