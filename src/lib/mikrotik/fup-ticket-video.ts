import type { RouterOSClient } from "./client";
import { quoteRos } from "./content-filter";

export const VIDEO_OWNER = "SafeLinkHub FUP video v1";
export const VIDEO_LIST = "slh-fup-video-destinations";
export const VIDEO_OUT = "slh-fup-video-out";
export const VIDEO_IN = "slh-fup-video-in";
// Exact domains + subdomains, never the entire Google/ByteDance networks.
export const VIDEO_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "googlevideo.com",
  "ytimg.com",
  "youtubei.googleapis.com",
  "youtube.googleapis.com",
  "tiktok.com",
  "tiktokv.com",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "ttwstatic.com",
  "musical.ly",
];
const timeout = 15000;
export async function ensureVideoDestinations(client: RouterOSClient) {
  const hotspots = await client.talk(
    ["/ip/hotspot/print", "=.proplist=interface,disabled"],
    timeout,
  );
  const v6 = await client.talk(
    ["/ipv6/address/print", "=.proplist=interface,address,disabled"],
    timeout,
  );
  if (
    v6.some(
      (r) =>
        r.disabled !== "true" &&
        !r.address?.startsWith("fe80:") &&
        hotspots.some(
          (h) => h.disabled !== "true" && h.interface === r.interface,
        ),
    )
  )
    throw new Error(
      "IPv6 actif sur le HotSpot : validation réseau requise avant exception vidéo IPv4.",
    );
  const [clock] = await client.talk(["/system/clock/print"], timeout);
  if (
    !clock ||
    !/^\d{4}-\d{2}-\d{2}$/.test(clock.date ?? "") ||
    !["+00:00", "00:00", "0s", "+00:00:00"].includes(clock["gmt-offset"] ?? "")
  )
    throw new Error("Horloge UTC ISO requise pour la sanction vidéo.");
  const dns = await client.talk(
    [
      "/ip/dns/static/print",
      "=.proplist=.id,name,comment,type,address-list,match-subdomain,disabled",
    ],
    timeout,
  );
  for (const domain of VIDEO_DOMAINS) {
    const existing = dns.filter((r) => r.name === domain);
    if (existing.some((r) => r.comment !== VIDEO_OWNER))
      throw new Error(
        `DNS ${domain} déjà géré par une autre règle : exception vidéo non installée.`,
      );
  }
  let changed = false;
  for (const domain of VIDEO_DOMAINS) {
    const row = dns.find((r) => r.name === domain);
    if (
      row &&
      row.type === "FWD" &&
      row["address-list"] === VIDEO_LIST &&
      row["match-subdomain"] === "true" &&
      row.disabled !== "true"
    )
      continue;
    await client.talk(
      [
        `/ip/dns/static/${row ? "set" : "add"}`,
        ...(row ? [`=numbers=${row[".id"]}`] : []),
        `=name=${domain}`,
        "=type=FWD",
        "=match-subdomain=yes",
        `=address-list=${VIDEO_LIST}`,
        `=comment=${VIDEO_OWNER}`,
        "=disabled=no",
      ],
      timeout,
    );
    changed = true;
  }
  for (const [chain, field, port] of [
    [VIDEO_OUT, "dst", "dst-port"],
    [VIDEO_IN, "src", "src-port"],
  ]) {
    const rows = await client.talk(
      ["/ip/firewall/filter/print", `?chain=${chain}`],
      timeout,
    );
    if (rows.some((r) => r.comment !== VIDEO_OWNER))
      throw new Error("Chaîne vidéo déjà utilisée hors SafeLinkHub.");
    const wanted = [
      {
        protocol: "tcp",
        [port]: "80,443",
        [`${field}-address-list`]: VIDEO_LIST,
        action: "return",
      },
      {
        protocol: "udp",
        [port]: "443",
        [`${field}-address-list`]: VIDEO_LIST,
        action: "return",
      },
      { action: "drop" },
    ];
    // A dedicated chain has deterministic order. Rebuild only if absent;
    // refuse unexpected rules instead of weakening another filter.
    if (
      rows.length > 3 ||
      rows.some(
        (r, i) =>
          Object.entries(wanted[i]).some(([k, v]) => r[k] !== v) ||
          r.disabled === "true",
      )
    )
      throw new Error("Chaîne vidéo modifiée : vérifier le routeur.");
    for (const params of wanted.slice(rows.length))
      await client.talk(
        [
          "/ip/firewall/filter/add",
          `=chain=${chain}`,
          `=comment=${VIDEO_OWNER}`,
          ...Object.entries(params).map(([k, v]) => `=${k}=${v}`),
        ],
        timeout,
      );
  }
  // Only the initial DNS configuration needs a cache flush. Normal passes don't
  // flush DNS and do not resolve millions of possible CDN hostnames themselves.
  if (changed) await client.talk(["/ip/dns/cache/flush"], timeout);
}

export type VideoScriptInput = {
  user: string;
  id: string;
  comment: string;
  until: number;
  name: string;
  schedulerComment: string;
  cleanup: string;
};
/** Local 5-second reconciliation: no profile hooks, expiry or credentials changed.
 * Lists expire within 10 seconds on a script failure to avoid stale-IP sanctions.
 * A reconnect can have a <=5 s gap; DNS/CDN classification is best effort. */
export function videoSessionScript(p: VideoScriptInput) {
  const q = quoteRos,
    end = new Date(p.until).toISOString(),
    date = Number(end.slice(0, 10).replaceAll("-", "")),
    time = Number(end.slice(11, 19).replaceAll(":", ""));
  return `:do {
 :local d [/system clock get date];
 :local t [/system clock get time];
 :if ([:len $d] != 10 || [:pick $d 4 5] != "-") do={ :error "FUP video requires ISO UTC clock" };
 :local today [:tonum ([:pick $d 0 4].[:pick $d 5 7].[:pick $d 8 10])];
 :local clock [:tonum ([:pick $t 0 2].[:pick $t 3 5].[:pick $t 6 8])];
 :local u [/ip hotspot user find where name=${q(p.user)}];
 :local valid false;
 :if ([:len $u] = 1) do={
  :if ([:tostr $u] = ${q(p.id.toLowerCase())}) do={
   :if ([/ip hotspot user get $u comment] = ${q(p.comment)} && [/ip hotspot user get $u disabled] = false) do={ :set valid true }
  }
 };
 :if ($today > ${date} || ($today = ${date} && $clock >= ${time}) || $valid = false) do={
  ${p.cleanup}
 } else={
  :local targets "";
  :foreach a in=[/ip hotspot active find where user=${q(p.user)}] do={
   :local ip [/ip hotspot active get $a address];
   :if ([:len $targets] > 0) do={ :set targets ($targets.",") };
   :set targets ($targets.$ip."/32")
  };
  :local queue [/queue simple find where name=${q(p.name)} and comment="SafeLinkHub FUP ticket v1"];
  :if ([:len $queue] != 1) do={ :error "FUP video queue missing" };
  :if ([:len $targets] = 0) do={ /queue simple set $queue disabled=yes } else={ /queue simple set $queue target=$targets disabled=no };
  /ip firewall address-list remove [find where list=${q(p.name)} and comment=${q(VIDEO_OWNER)}];
  :foreach a in=[/ip hotspot active find where user=${q(p.user)}] do={
   /ip firewall address-list add list=${q(p.name)} address=[/ip hotspot active get $a address] timeout=10s comment=${q(VIDEO_OWNER)}
  }
 }
} on-error={
 :do { /queue simple set [find where name=${q(p.name)} and comment="SafeLinkHub FUP ticket v1"] disabled=yes } on-error={};
 /ip firewall address-list remove [find where list=${q(p.name)} and comment=${q(VIDEO_OWNER)}];
 :log error "SafeLinkHub FUP video: session reconciliation failed";
 :error "FUP video session reconciliation failed"
}`;
}
