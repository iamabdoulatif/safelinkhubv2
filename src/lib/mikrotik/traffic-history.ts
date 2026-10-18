/** Counter arithmetic only: no router or database access, usable by charts. */
export const TRAFFIC_INTERVAL = 300_000;
export const MAX_TRAFFIC_INTERVAL = 450_000;
export type TrafficCondition = {
  kind: "fup" | "restriction" | "outage";
  source: "safelinkhub" | "mikrotik" | "starlink";
  certainty: "confirmed" | "suspected";
  evidence: string;
  linkId?: string;
};
export type TrafficLink = { id: string; name: string; interface: string };
export type TrafficObservation = {
  at: number;
  uptime: number | null;
  links: (TrafficLink & {
    rx: number | null;
    tx: number | null;
    running: boolean | null;
  })[];
  clients: Record<string, number | null> | null;
  conditions: TrafficCondition[];
};
export type TrafficBaseline = {
  at: number;
  uptime: number | null;
  links: Record<
    string,
    {
      at: number;
      uptime: number | null;
      interface: string;
      rx: number;
      tx: number;
    }
  >;
  clients: {
    at: number;
    uptime: number | null;
    counters: Record<string, number | null>;
  } | null;
};
export type TrafficLinkSample = TrafficLink & {
  rxBytes: number | null;
  txBytes: number | null;
  rxMbps: number | null;
  txMbps: number | null;
  intervalStart: number | null;
  intervalSeconds: number | null;
  running: boolean | null;
  quality: "ok" | "first" | "reset" | "missing" | "gap";
};
export type TrafficSample = {
  at: number;
  bucket?: number;
  links: TrafficLinkSample[];
  connected: number | null;
  exchanging: number | null;
  conditions: TrafficCondition[];
};
export type TrafficIncident = TrafficCondition & {
  linkId: string;
  start: number;
  end: number | null;
};
export function trafficBucket(at: number) {
  return Math.floor(at / TRAFFIC_INTERVAL) * TRAFFIC_INTERVAL;
}
const validCounter = (n: number | null): n is number =>
  n !== null && Number.isSafeInteger(n) && n >= 0;

export function advanceTrafficHistory(
  previous: TrafficBaseline | null,
  current: TrafficObservation,
) {
  if (!Number.isFinite(current.at) || (previous && current.at <= previous.at))
    throw new Error("Relevé non chronologique.");
  const reboot =
    previous?.uptime != null &&
    current.uptime != null &&
    current.uptime < previous.uptime + (current.at - previous.at) / 1000 - 30;
  const state: TrafficBaseline = {
    at: current.at,
    uptime: current.uptime,
    links: { ...previous?.links },
    clients: previous?.clients ?? null,
  };
  const links = current.links.map((link) => {
    const old = previous?.links[link.id];
    const sample: TrafficLinkSample = {
      id: link.id,
      name: link.name,
      interface: link.interface,
      rxBytes: null,
      txBytes: null,
      rxMbps: null,
      txMbps: null,
      intervalStart: null,
      intervalSeconds: null,
      running: link.running,
      quality: "missing",
    };
    if (
      !validCounter(link.rx) ||
      !validCounter(link.tx) ||
      current.uptime === null
    )
      return sample;
    state.links[link.id] = {
      at: current.at,
      uptime: current.uptime,
      interface: link.interface,
      rx: link.rx,
      tx: link.tx,
    };
    if (!old || old.interface !== link.interface)
      return { ...sample, quality: "first" as const };
    const elapsed = current.at - old.at;
    // Compare uptime against this link's baseline, not just the last failed poll.
    const linkReboot =
      old.uptime != null &&
      current.uptime != null &&
      current.uptime < old.uptime + elapsed / 1000 - 30;
    if (linkReboot || link.rx < old.rx || link.tx < old.tx)
      return { ...sample, quality: "reset" as const };
    if (elapsed <= 0) return sample;
    sample.intervalStart = old.at;
    sample.intervalSeconds = elapsed / 1000;
    sample.rxBytes = link.rx - old.rx;
    sample.txBytes = link.tx - old.tx;
    sample.quality = elapsed > MAX_TRAFFIC_INTERVAL ? "gap" : "ok";
    if (sample.quality === "ok") {
      sample.rxMbps = (sample.rxBytes * 8) / sample.intervalSeconds / 1e6;
      sample.txMbps = (sample.txBytes * 8) / sample.intervalSeconds / 1e6;
    }
    return sample;
  });
  let exchanging: number | null = null;
  if (current.clients !== null) {
    const old = previous?.clients;
    const entries = Object.entries(current.clients);
    if (
      !reboot &&
      old &&
      current.uptime !== null &&
      old.uptime !== null &&
      current.uptime >= old.uptime + (current.at - old.at) / 1000 - 30 &&
      current.at - old.at <= MAX_TRAFFIC_INTERVAL &&
      entries.every(([, n]) => validCounter(n))
    ) {
      // Sessions which disappear/reconnect can have lower counters; never call
      // them idle just because a baseline was reset.
      if (
        entries.every(
          ([id, n]) =>
            !(id in old.counters) ||
            (validCounter(old.counters[id]) && n! >= old.counters[id]!),
        )
      ) {
        exchanging = entries.filter(
          ([id, n]) => n! > (old.counters[id] ?? 0),
        ).length;
      }
    }
    state.clients = {
      at: current.at,
      uptime: current.uptime,
      counters: current.clients,
    };
  }
  return {
    state,
    sample: {
      at: current.at,
      bucket: trafficBucket(current.at),
      links,
      connected:
        current.clients === null ? null : Object.keys(current.clients).length,
      exchanging,
      conditions: current.conditions,
    } satisfies TrafficSample,
  };
}

export function observedPeriods(samples: TrafficSample[]) {
  const result: (TrafficCondition & { start: number; end: number })[] = [];
  let open = new Map<string, (typeof result)[number]>();
  let previousAt = 0;
  for (const sample of samples) {
    if (sample.at - previousAt > MAX_TRAFFIC_INTERVAL) open = new Map();
    const next = new Map<string, (typeof result)[number]>();
    for (const condition of sample.conditions) {
      const key = [
        condition.kind,
        condition.source,
        condition.certainty,
        condition.linkId ?? "",
        condition.evidence,
      ].join("|");
      const existing = open.get(key);
      if (existing) existing.end = sample.at;
      const period = existing ?? {
        ...condition,
        start: sample.at,
        end: sample.at,
      };
      if (!existing) result.push(period);
      next.set(key, period);
    }
    open = next;
    previousAt = sample.at;
  }
  return result;
}

export function validateHistoryRange(
  start: number,
  end: number,
  now = Date.now(),
) {
  if (
    ![start, end].every(Number.isFinite) ||
    start < 0 ||
    start >= end ||
    end - start > 31 * 86400000 ||
    end > now + 60000
  )
    return "Choisissez une période passée de 31 jours maximum.";
  return null;
}
export function validateIncident(
  value: unknown,
  now = Date.now(),
): string | null {
  if (!value || typeof value !== "object") return "Événement invalide.";
  const v = value as TrafficIncident;
  if (
    typeof v.linkId !== "string" ||
    !v.linkId ||
    v.linkId.length > 120 ||
    !["fup", "restriction", "outage"].includes(v.kind) ||
    !["safelinkhub", "mikrotik", "starlink"].includes(v.source) ||
    !["confirmed", "suspected"].includes(v.certainty)
  )
    return "Source, liaison ou qualification invalide.";
  if (
    typeof v.evidence !== "string" ||
    v.evidence.trim().length < 5 ||
    v.evidence.length > 1000
  )
    return "Précisez la source du constat (5 à 1 000 caractères).";
  if (
    !Number.isFinite(v.start) ||
    v.start < 0 ||
    v.start > now ||
    (v.end !== null &&
      (!Number.isFinite(v.end) || v.end < v.start || v.end > now))
  )
    return "Dates de l’événement invalides.";
  return null;
}

/** Graph pages have no login: only allow a private management subnet. */
export function privateGraphPrefix(value: string) {
  if (typeof value !== "string") return false;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(
    value,
  );
  if (!match) return false;
  const [a, b, c, d, bits] = match.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255) || bits > 32) return false;
  return (
    (a === 10 && bits >= 8) ||
    (a === 172 && b >= 16 && b <= 31 && bits >= 12) ||
    (a === 192 && b === 168 && bits >= 16) ||
    (a === 127 && bits >= 8)
  );
}

export type TrafficChartPoint = {
  at: number;
  rxMbps: number | null;
  txMbps: number | null;
  connected: number | null;
  exchanging: number | null;
};
export function trafficChart(
  samples: TrafficSample[],
  linkId: string,
  start: number,
  end: number,
  step: number,
): TrafficChartPoint[] {
  if (step < TRAFFIC_INTERVAL || end - start > 31 * 86400000)
    throw new Error("Période invalide.");
  const buckets = new Map<number, TrafficSample[]>();
  for (const sample of samples) {
    const key = Math.floor((sample.bucket ?? sample.at) / step) * step;
    const group = buckets.get(key) ?? [];
    group.push(sample);
    buckets.set(key, group);
  }
  const points: TrafficChartPoint[] = [];
  for (let at = Math.floor(start / step) * step; at < end; at += step) {
    const group = buckets.get(at) ?? [];
    const mean = (values: (number | null)[]) =>
      values.length && values.every((n) => n !== null)
        ? values.reduce<number>((sum, n) => sum + n!, 0) / values.length
        : null;
    const links = group.map((s) => s.links.find((l) => l.id === linkId));
    // A missing entire five-minute slot in an hourly bucket breaks the line.
    // Partial first/current hours are expected to contain fewer slots.
    const required = Math.floor(
      (Math.min(end, at + step) - Math.max(start, at)) / TRAFFIC_INTERVAL,
    );
    const complete =
      new Set(group.map((s) => s.bucket ?? trafficBucket(s.at))).size >=
      Math.max(1, required);
    points.push({
      at,
      rxMbps: complete ? mean(links.map((l) => l?.rxMbps ?? null)) : null,
      txMbps: complete ? mean(links.map((l) => l?.txMbps ?? null)) : null,
      connected: complete ? mean(group.map((s) => s.connected)) : null,
      exchanging: complete ? mean(group.map((s) => s.exchanging)) : null,
    });
  }
  return points;
}
