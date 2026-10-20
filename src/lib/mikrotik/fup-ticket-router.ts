import { cleanupFupResource } from "./fup-cleanup";
import { createHash } from "node:crypto";
import type { RouterOSClient } from "./client";
import { quoteRos } from "./content-filter";
import { FUP_QUEUE, FUP_LIST } from "./starlink-fup-enforcement";
import type { ActiveSession } from "./regulation";
import type { TicketStates, TicketPolicy } from "./fup-ticket-policy";
import {
  ensureVideoDestinations,
  videoSessionScript,
  VIDEO_OWNER,
  VIDEO_OUT,
  VIDEO_IN,
} from "./fup-ticket-video";
const OWNER = "SafeLinkHub FUP ticket v1";
const key = (user: string) =>
  createHash("sha256").update(user).digest("hex").slice(0, 20);
type Recovery = {
  user: string;
  id: string;
  comment: string;
  until: number;
  blocked: boolean;
  video?: boolean;
};
const prefix = OWNER + " ";
function recovery(s: Record<string, string> | undefined): Recovery | null {
  try {
    const m = s?.comment?.startsWith(prefix)
      ? JSON.parse(s.comment.slice(prefix.length))
      : null;
    return m &&
      typeof m.user === "string" &&
      typeof m.id === "string" &&
      typeof m.comment === "string" &&
      Number.isFinite(m.until) &&
      typeof m.blocked === "boolean"
      ? m
      : null;
  } catch {
    return null;
  }
}
function cleanupScript(name: string, meta: Recovery) {
  const q = quoteRos;
  // Legacy sanctions are the ONLY ones that disabled accounts. New releases
  // never enable users: expiry/Mikhmon/manual disable must remain authoritative.
  const restore =
    meta.blocked && !meta.video
      ? `:local u [/ip hotspot user find where name=${q(meta.user)}]; :if ([:len $u] = 1) do={ :if ([:tostr $u] = ${q(meta.id.toLowerCase())} && [/ip hotspot user get $u comment] = ${q(meta.comment)}) do={ /ip hotspot user set $u disabled=no } }; `
      : "";
  return `${restore}/ip firewall filter remove [find where comment=${q(VIDEO_OWNER + " " + name)}]; /ip firewall address-list remove [find where list=${q(name)} and comment=${q(VIDEO_OWNER)}]; /queue simple remove [find where name=${q(name)} and comment=${q(OWNER)}]; /system scheduler remove [find where name=${q(name)} and comment=${q(prefix + JSON.stringify(meta))}]`;
}
async function removeVideoRules(client: RouterOSClient, name: string) {
  for (const path of ["/ip/firewall/filter", "/ip/firewall/address-list"]) {
    const rows = await client.talk(
      [
        path + "/print",
        ...(path.endsWith("filter")
          ? [`?comment=${VIDEO_OWNER + " " + name}`]
          : [`?list=${name}`]),
      ],
      10000,
    );
    for (const r of rows.filter(
      (r) =>
        r.comment ===
        (path.endsWith("filter") ? VIDEO_OWNER + " " + name : VIDEO_OWNER),
    ))
      await cleanupFupResource(client, [path + "/remove", `=numbers=${r[".id"]}`], 10000);
  }
}
async function armVideo(
  client: RouterOSClient,
  name: string,
  meta: Recovery,
  scheduler: Record<string, string> | undefined,
  cleanup: string,
) {
  const label = VIDEO_OWNER + " " + name;
  const lists = await client.talk(
    ["/ip/firewall/address-list/print", `?list=${name}`],
    10000,
  );
  if (lists.some((r) => r.comment !== VIDEO_OWNER))
    throw new Error("Liste vidéo réservée déjà utilisée.");
  const rules = await client.talk(
    ["/ip/firewall/filter/print", `?comment=${label}`],
    10000,
  );
  const ordered = await client.talk(
    ["/ip/firewall/filter/print", "=.proplist=.id,dynamic"],
    10000,
  );
  const first = ordered.find((r) => r.dynamic !== "true");
  for (const [direction, chain] of [
    ["out", VIDEO_OUT],
    ["in", VIDEO_IN],
  ]) {
    const params = {
      chain: "forward",
      action: "jump",
      "jump-target": chain,
      [`${direction}-interface-list`]: FUP_LIST,
      [`${direction === "out" ? "src" : "dst"}-address-list`]: name,
      comment: label,
      disabled: "no",
    };
    const existing = rules.find((r) => r["jump-target"] === chain);
    await client.talk(
      [
        `/ip/firewall/filter/${existing ? "set" : "add"}`,
        ...(existing ? [`=numbers=${existing[".id"]}`] : []),
        ...Object.entries(params).map(([k, v]) => `=${k}=${v}`),
      ],
      10000,
    );
  }
  // Drop-only chains may be before global stop rules: 'return' continues the
  // normal forward chain, so global cutoff/content filtering are never bypassed.
  const installed = await client.talk(
    ["/ip/firewall/filter/print", `?comment=${label}`],
    10000,
  );
  if (first)
    for (const rule of installed)
      if (rule[".id"] !== first[".id"])
        await client.talk(
          [
            "/ip/firewall/filter/move",
            `=numbers=${rule[".id"]}`,
            `=destination=${first[".id"]}`,
          ],
          10000,
        );
  const [clock] = await client.talk(["/system/clock/print"], 10000);
  if (
    !clock ||
    !/^\d{4}-\d{2}-\d{2}$/.test(clock.date ?? "") ||
    !/^\d{2}:\d{2}:\d{2}$/.test(clock.time ?? "")
  )
    throw new Error("Horloge du routeur indisponible.");
  const source = videoSessionScript({
    ...meta,
    name,
    schedulerComment: prefix + JSON.stringify(meta),
    cleanup,
  });
  // Recovery is installed before old-account migration or any session restriction.
  await client.talk(
    [
      `/system/scheduler/${scheduler ? "set" : "add"}`,
      ...(scheduler ? [`=numbers=${scheduler[".id"]}`] : [`=name=${name}`]),
      `=comment=${prefix + JSON.stringify(meta)}`,
      `=start-date=${clock.date}`,
      `=start-time=${clock.time}`,
      "=interval=5s",
      "=policy=read,write,policy,test",
      `=on-event=${source}`,
      "=disabled=no",
    ],
    10000,
  );
  return source;
}
async function initializeVideo(
  client: RouterOSClient,
  name: string,
  source: string,
) {
  const init = name + "-init";
  const [existing] = await client.talk(
    ["/system/script/print", "=.proplist=.id,name,comment", `?name=${init}`],
    15000,
  );
  if (existing && existing.comment !== VIDEO_OWNER)
    throw new Error("Script vidéo réservé déjà utilisé.");
  await client.talk(
    [
      `/system/script/${existing ? "set" : "add"}`,
      ...(existing ? [`=numbers=${existing[".id"]}`] : [`=name=${init}`]),
      `=source=${source}`,
      `=comment=${VIDEO_OWNER}`,
      "=policy=read,write,policy,test",
    ],
    15000,
  );
  try {
    await client.talk(["/system/script/run", `=number=${init}`], 20000);
  } finally {
    const [row] = await client.talk(
      ["/system/script/print", "=.proplist=.id,name,comment", `?name=${init}`],
      15000,
    );
    if (row?.comment === VIDEO_OWNER)
      await cleanupFupResource(client,
        ["/system/script/remove", `=numbers=${row[".id"]}`],
        15000,
      );
  }
}
export async function applyTicketPolicy(
  client: RouterOSClient,
  state: TicketStates,
  active: ActiveSession[],
  policy: TicketPolicy,
) {
  const users = await client.talk(
    ["/ip/hotspot/user/print", "=.proplist=.id,name,disabled,comment"],
    10000,
  );
  const queues = await client.talk(
    ["/queue/simple/print", "=.proplist=.id,name,comment"],
    10000,
  );
  const schedulers = await client.talk(
    ["/system/scheduler/print", "=.proplist=.id,name,comment"],
    10000,
  );
  const wanted = new Set(
    Object.entries(state)
      .filter(([, v]) => v.phase !== "normal")
      .map(([u]) => key(u)),
  );
  for (const s of schedulers) {
    const meta = recovery(s);
    if (!meta || wanted.has(key(meta.user))) continue;
    const u = users.find(
      (u) =>
        u.name === meta.user &&
        u[".id"] === meta.id &&
        u.comment === meta.comment,
    );
    if (meta.blocked && !meta.video && u?.disabled === "true")
      await client.talk(
        ["/ip/hotspot/user/set", `=numbers=${u[".id"]}`, "=disabled=no"],
        10000,
      );
    await removeVideoRules(client, s.name);
    await cleanupFupResource(client,
      ["/system/scheduler/remove", `=numbers=${s[".id"]}`],
      10000,
    );
  }
  for (const q of queues)
    if (
      q.comment === OWNER &&
      q.name.startsWith("slh-fup-ticket-") &&
      !wanted.has(q.name.slice("slh-fup-ticket-".length))
    )
      await cleanupFupResource(client,
        ["/queue/simple/remove", `=numbers=${q[".id"]}`],
        10000,
      );
  let videoReady = false;
  for (const [user, status] of Object.entries(state)) {
    if (status.phase === "normal") continue;
    const name = "slh-fup-ticket-" + key(user),
      u = users.find((u) => u.name === user);
    const queue = queues.find((q) => q.name === name),
      scheduler = schedulers.find((s) => s.name === name),
      owned = recovery(scheduler);
    if ((queue && queue.comment !== OWNER) || (scheduler && !owned))
      throw new Error("Nom réservé de sanction déjà utilisé.");
    if (
      owned &&
      (!u || owned.id !== u[".id"] || owned.comment !== (u.comment ?? ""))
    ) {
      await removeVideoRules(client, name);
      if (scheduler)
        await cleanupFupResource(client,
          ["/system/scheduler/remove", `=numbers=${scheduler[".id"]}`],
          10000,
        );
      if (queue)
        await cleanupFupResource(client,
          ["/queue/simple/remove", `=numbers=${queue[".id"]}`],
          10000,
        );
      delete state[user];
      continue;
    }
    const legacy = owned?.blocked && !owned.video;
    if (!u || (u.disabled === "true" && !legacy)) {
      await removeVideoRules(client, name);
      if (scheduler)
        await cleanupFupResource(client,
          ["/system/scheduler/remove", `=numbers=${scheduler[".id"]}`],
          10000,
        );
      if (queue)
        await cleanupFupResource(client,
          ["/queue/simple/remove", `=numbers=${queue[".id"]}`],
          10000,
        );
      delete state[user];
      continue;
    }
    if (owned?.blocked || owned?.video) {
      status.phase = "blocked";
      status.until = owned.until;
    }
    const video = status.phase === "blocked";
    const meta: Recovery = {
      user,
      id: u[".id"],
      comment: u.comment ?? "",
      until: status.until,
      blocked: false,
      ...(video ? { video: true } : {}),
    };
    const targets = [
      ...new Set(
        active
          .filter(
            (s) => s.user === user && /^\d{1,3}(\.\d{1,3}){3}$/.test(s.address),
          )
          .map((s) => s.address + "/32"),
      ),
    ];
    if (video) {
      if (
        !queues.some(
          (q) => q.name === FUP_QUEUE && q.comment === "SafeLinkHub FUP v2",
        )
      )
        throw new Error(
          "Plafond partagé FUP absent : exception vidéo non installée.",
        );
      if (!videoReady) {
        await ensureVideoDestinations(client);
        videoReady = true;
      }
    }
    const cleanup = cleanupScript(name, meta);
    // Arm cleanup first for throttle, too: a failed queue write must not leave a ban.
    // Keep an old legacy recovery armed until its account is re-enabled.
    // Otherwise create expiry cleanup BEFORE any queue mutation. The recurring
    // session scan is enabled only after its queue exists.
    if (!legacy) {
      const end = new Date(Math.ceil(status.until / 1000) * 1000).toISOString();
      await client.talk(
        [
          `/system/scheduler/${scheduler ? "set" : "add"}`,
          ...(scheduler ? [`=numbers=${scheduler[".id"]}`] : [`=name=${name}`]),
          `=comment=${prefix + JSON.stringify(meta)}`,
          `=start-date=${end.slice(0, 10)}`,
          `=start-time=${end.slice(11, 19)}`,
          "=interval=1m",
          "=policy=read,write,policy,test",
          `=on-event=${cleanup}`,
          "=disabled=no",
        ],
        10000,
      );
    }
    if (!video && !targets.length) {
      if (queue)
        await cleanupFupResource(client,
          ["/queue/simple/remove", `=numbers=${queue[".id"]}`],
          10000,
        );
      continue;
    }
    const bps = video ? 1000000 : policy.throttleKbps * 1000;
    await client.talk(
      [
        `/queue/simple/${queue ? "set" : "add"}`,
        ...(queue ? [`=numbers=${queue[".id"]}`] : [`=name=${name}`]),
        `=comment=${OWNER}`,
        `=target=${targets.length ? targets.join(",") : "0.0.0.0/32"}`,
        `=parent=${FUP_QUEUE}`,
        `=max-limit=${bps}/${bps}`,
        "=queue=default-small/default-small",
        `=disabled=${targets.length ? "no" : "yes"}`,
      ],
      10000,
    );
    // Re-enable ONLY an old FUP-owned disabled account after installing recovery.
    if (legacy && u.disabled === "true")
      await client.talk(
        ["/ip/hotspot/user/set", `=numbers=${u[".id"]}`, "=disabled=no"],
        10000,
      );
    if (video) {
      // A newly added scheduler must be looked up before updating it.
      const [current] = await client.talk(
        ["/system/scheduler/print", `?name=${name}`],
        10000,
      );
      const source = await armVideo(
        client,
        name,
        meta,
        current ?? scheduler,
        cleanup,
      );
      await initializeVideo(client, name, source);
    }
  }
}
