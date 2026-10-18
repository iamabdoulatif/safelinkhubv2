"use server";

import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  routerRegulation,
  routers,
  routerTrafficIncidents,
  routerTrafficSamples,
  routerTrafficState,
} from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { connectToRouter } from "./router-sync";
import { enableTrafficGraphing } from "./traffic-reader";
import { configuredTrafficLinks } from "./traffic-collector";
import {
  observedPeriods,
  trafficChart,
  validateHistoryRange,
  validateIncident,
  type TrafficIncident,
  type TrafficLink,
} from "./traffic-history";

async function authorize(routerId: string, write = false) {
  const session = await getSession();
  if (
    !session ||
    (write && !can(session.role, "routers")) ||
    typeof routerId !== "string" ||
    !/^[\da-f-]{36}$/i.test(routerId)
  )
    return null;
  const [router] = await getDb()
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (
    !router ||
    (!isSuperAdmin(session.role) && router.orgId !== session.orgId)
  )
    return null;
  return { router, session };
}
async function historyLinks(router: typeof routers.$inferSelect) {
  const db = getDb();
  const [regulation] = await db
    .select({ links: routerRegulation.fupLinks })
    .from(routerRegulation)
    .where(eq(routerRegulation.routerId, router.id))
    .limit(1);
  const [latest] = await db
    .select({ payload: routerTrafficSamples.payload })
    .from(routerTrafficSamples)
    .where(eq(routerTrafficSamples.routerId, router.id))
    .orderBy(desc(routerTrafficSamples.measuredAt))
    .limit(1);
  const links = configuredTrafficLinks(router, regulation?.links ?? null);
  return links.length
    ? links
    : (latest?.payload.links.map(({ id, name, interface: iface }) => ({
        id,
        name,
        interface: iface,
      })) ?? []);
}
async function samplesFor(routerId: string, start: number, end: number) {
  return getDb()
    .select({ payload: routerTrafficSamples.payload })
    .from(routerTrafficSamples)
    .where(
      and(
        eq(routerTrafficSamples.routerId, routerId),
        gte(routerTrafficSamples.measuredAt, new Date(start)),
        lte(routerTrafficSamples.measuredAt, new Date(end)),
      ),
    )
    .orderBy(asc(routerTrafficSamples.measuredAt))
    .limit(9000);
}

export async function readRouterTrafficHistory(
  routerId: string,
  start: number,
  end: number,
) {
  const auth = await authorize(routerId);
  if (!auth) return { error: "Routeur introuvable ou accès refusé." };
  const error = validateHistoryRange(start, end);
  if (error) return { error };
  const db = getDb();
  const [rows, configured, incidents, state] = await Promise.all([
    samplesFor(routerId, start, end),
    historyLinks(auth.router),
    db
      .select()
      .from(routerTrafficIncidents)
      .where(
        and(
          eq(routerTrafficIncidents.routerId, routerId),
          lte(routerTrafficIncidents.startedAt, new Date(end)),
          or(
            isNull(routerTrafficIncidents.endedAt),
            gte(routerTrafficIncidents.endedAt, new Date(start)),
          ),
        ),
      )
      .orderBy(desc(routerTrafficIncidents.startedAt))
      .limit(501),
    db
      .select({ graphing: routerTrafficState.graphing })
      .from(routerTrafficState)
      .where(eq(routerTrafficState.routerId, routerId))
      .limit(1),
  ]);
  const samples = rows.map((r) => r.payload);
  const linkMap = new Map<string, TrafficLink>(
    configured.map((l) => [l.id, l]),
  );
  for (const s of samples)
    for (const l of s.links)
      if (!linkMap.has(l.id))
        linkMap.set(l.id, { id: l.id, name: l.name, interface: l.interface });
  const step = end - start > 2 * 86400000 ? 3600000 : 300000;
  const links = [...linkMap.values()];
  return {
    start,
    end,
    step,
    links: links.map((link) => ({
      ...link,
      points: trafficChart(samples, link.id, start, end, step),
      rxBytes: samples.reduce((sum, s) => {
        const l = s.links.find((l) => l.id === link.id);
        return (
          sum +
          (l?.intervalStart != null && l.intervalStart >= start
            ? (l.rxBytes ?? 0)
            : 0)
        );
      }, 0),
      txBytes: samples.reduce((sum, s) => {
        const l = s.links.find((l) => l.id === link.id);
        return (
          sum +
          (l?.intervalStart != null && l.intervalStart >= start
            ? (l.txBytes ?? 0)
            : 0)
        );
      }, 0),
      measured: samples.filter(
        (s) => s.links.find((l) => l.id === link.id)?.quality === "ok",
      ).length,
    })),
    sampleCount: samples.length,
    latestAt: samples.at(-1)?.at ?? null,
    latestConnected: samples.at(-1)?.connected ?? null,
    latestExchanging: samples.at(-1)?.exchanging ?? null,
    observed: observedPeriods(samples),
    incidents: incidents.slice(0, 500).map((i) => ({
      id: i.id,
      linkId: i.linkId,
      kind: i.kind,
      source: i.source,
      certainty: i.certainty,
      evidence: i.evidence,
      start: i.startedAt.getTime(),
      end: i.endedAt?.getTime() ?? null,
    })),
    incidentsTruncated: incidents.length > 500,
    graphing: state[0]?.graphing ?? null,
    canManage: can(auth.session.role, "routers"),
  };
}

export async function exportRouterTrafficHistory(
  routerId: string,
  start: number,
  end: number,
) {
  if (!(await authorize(routerId))) return { error: "Accès refusé." };
  const error = validateHistoryRange(start, end);
  if (error) return { error };
  const rows = await samplesFor(routerId, start, end);
  const cell = (v: unknown) => {
    const text = String(v ?? "");
    const safe =
      typeof v === "string" && /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const csv = [
    [
      "date_utc",
      "liaison",
      "interface",
      "debut_intervalle_utc",
      "secondes",
      "reception_octets",
      "envoi_octets",
      "reception_mbps",
      "envoi_mbps",
      "connectes_routeur",
      "echangent_routeur",
      "qualite",
      "interface_active",
      "constats",
    ].join(","),
  ];
  for (const { payload: s } of rows)
    for (const l of s.links)
      csv.push(
        [
          new Date(s.at).toISOString(),
          l.name,
          l.interface,
          l.intervalStart === null
            ? null
            : new Date(l.intervalStart).toISOString(),
          l.intervalSeconds,
          l.rxBytes,
          l.txBytes,
          l.rxMbps,
          l.txMbps,
          s.connected,
          s.exchanging,
          l.quality,
          l.running,
          JSON.stringify(s.conditions),
        ]
          .map(cell)
          .join(","),
      );
  return { csv: "\uFEFF" + csv.join("\r\n") };
}

export async function recordTrafficIncident(
  routerId: string,
  incident: TrafficIncident,
) {
  const auth = await authorize(routerId, true);
  if (!auth) return { error: "Accès refusé." };
  const error = validateIncident(incident);
  if (error) return { error };
  if (!(await historyLinks(auth.router)).some((l) => l.id === incident.linkId))
    return { error: "Liaison inconnue." };
  await getDb()
    .insert(routerTrafficIncidents)
    .values({
      routerId,
      linkId: incident.linkId,
      kind: incident.kind,
      source: incident.source,
      certainty: incident.certainty,
      evidence: incident.evidence.trim(),
      startedAt: new Date(incident.start),
      endedAt: incident.end === null ? null : new Date(incident.end),
      recordedBy: auth.session.userId,
    });
  return { ok: true };
}
export async function closeTrafficIncident(
  routerId: string,
  incidentId: string,
  endedAt: number,
) {
  if (!(await authorize(routerId, true))) return { error: "Accès refusé." };
  if (
    !/^[\da-f-]{36}$/i.test(incidentId) ||
    !Number.isFinite(endedAt) ||
    endedAt > Date.now()
  )
    return { error: "Date ou événement invalide." };
  const result = await getDb()
    .update(routerTrafficIncidents)
    .set({ endedAt: new Date(endedAt) })
    .where(
      and(
        eq(routerTrafficIncidents.routerId, routerId),
        eq(routerTrafficIncidents.id, incidentId),
        isNull(routerTrafficIncidents.endedAt),
        lte(routerTrafficIncidents.startedAt, new Date(endedAt)),
      ),
    )
    .returning({ id: routerTrafficIncidents.id });
  return result.length
    ? { ok: true }
    : {
        error:
          "Événement introuvable, déjà terminé ou date antérieure au début.",
      };
}
export async function activateRouterTrafficGraphing(
  routerId: string,
  allowAddress: string,
) {
  const auth = await authorize(routerId, true);
  if (!auth) return { error: "Accès refusé." };
  const links = await historyLinks(auth.router);
  if (!links.length)
    return {
      error:
        "Configurez les interfaces Starlink dans Régulation ou attendez leur premier relevé.",
    };
  let client;
  try {
    client = await connectToRouter(auth.router, 15000, 1);
    await enableTrafficGraphing(
      client,
      links.map((l) => l.interface),
      allowAddress,
    );
    const graphing = {
      at: new Date().toISOString(),
      interfaces: links.map((l) => l.interface),
      allowAddress,
    };
    await getDb()
      .insert(routerTrafficState)
      .values({ routerId, graphing })
      .onConflictDoUpdate({
        target: routerTrafficState.routerId,
        set: { graphing },
      });
    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Activation des graphiques impossible.",
    };
  } finally {
    client?.close();
  }
}
