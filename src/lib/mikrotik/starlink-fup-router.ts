import type { RouterOSClient } from "./client";
import { quoteRos } from "./content-filter";
import { FUP_QUEUE, FUP_SCRIPT, FUP_LIST, FUP_STOP, type buildFupEnforcement } from "./starlink-fup-enforcement";

type Plan = ReturnType<typeof buildFupEnforcement>;
const OWNER = "SafeLinkHub FUP v2";
const scriptIndexes = new WeakMap<RouterOSClient, Map<string, Record<string, string>>>();
async function scriptIndex(client: RouterOSClient) {
  let index = scriptIndexes.get(client);
  if (!index) {
    index = new Map<string, Record<string, string>>();
    scriptIndexes.set(client, index);
  }
  return index;
}
async function removeScript(client: RouterOSClient, name: string) {
  const id = scriptIndexes.get(client)?.get(name)?.[".id"];
  if (!id) return;
  await client.talk(["/system/script/remove", `=numbers=${id}`], 30000);
  scriptIndexes.get(client)?.delete(name);
}
export type FupRuntime = { fastTrackIds: string[]; backup: string; appliedAt: string; totalBps: number; reserve: boolean; stopped: boolean; baselineKey?: string };

/** All resources have dedicated names; never reuse an unowned matching object. */
async function upsert(client: RouterOSClient, path: string, field: string, value: string, params: Record<string, string>) {
  const cached = path === "/system/script" ? await scriptIndex(client) : null;
  const rows = cached?.has(value) ? [cached.get(value)!] : await client.talk([`${path}/print`, "=.proplist=.id,name,comment", `?${field}=${value}`], cached ? 60000 : 15000);
  if (rows.some(r => r.comment !== OWNER)) throw new Error(`Ressource ${value} déjà utilisée hors FUP.`);
  const id = rows[0]?.[".id"];
  const result = await client.talk([`${path}/${id ? "set" : "add"}`, ...(id ? [`=numbers=${id}`] : [`=${field}=${value}`]),
    ...Object.entries({ ...params, comment: OWNER }).map(([k,v]) => `=${k}=${v}`)], 30000, Boolean(cached && !id));
  if (cached) {
    const actualId = id ?? result.find(r => r.ret)?.ret;
    if (!actualId) throw new Error("Identifiant API du script non renvoyé par RouterOS.");
    cached.set(value, { ".id": actualId, name: value, comment: OWNER });
  }
}

/** Applies a SHARED conservative cap. No ticket disabling or permanent bans. */
export async function applyFupToRouter(client: RouterOSClient, plan: Plan, previous: FupRuntime | null): Promise<FupRuntime> {
  const [resource] = await client.talk(["/system/resource/print"], 15000);
  if (!resource || !Number.isFinite(Number(resource["cpu-load"])) || Number(resource["cpu-load"]) >= 80) throw new Error("Charge CPU trop élevée ou illisible pour désactiver FastTrack.");
  const [clock] = await client.talk(["/system/clock/print"], 15000);
  const routerTime = clock?.date && clock?.time ? Date.parse(`${clock.date}T${clock.time}Z`) : NaN;
  if (!Number.isFinite(routerTime) || Math.abs(Date.now() - routerTime) > 60000 || !["+00:00", "00:00", "0s", "+00:00:00"].includes(clock["gmt-offset"] ?? "")) {
    throw new Error("Horloge MikroTik UTC synchronisée requise (écart maximum 60 secondes).");
  }
  const hotspots = await client.talk(["/ip/hotspot/print"], 15000);
  const targets = [...new Set(hotspots.filter(h => h.disabled !== "true").map(h => h.interface).filter(Boolean))];
  if (!targets.length) throw new Error("Aucune interface HotSpot active à réguler.");
  // Refuse to compete with an old autonomous script that can reset its quota.
  const oldGuard = await client.talk(["/system/scheduler/print", "?name=safelinkhub-quota-guard"], 15000);
  if (oldGuard.some(s => s.disabled !== "true")) throw new Error("Ancien garde-fou actif : le retirer avant FUP v2.");
  const ft = await client.talk(["/ip/firewall/filter/print", "?action=fasttrack-connection"], 15000);
  // IPv6 must be covered too; an unavailable firewall is an activation failure.
  const ft6 = await client.talk(["/ipv6/firewall/filter/print", "?action=fasttrack-connection"], 15000);
  if (ft6.some(r => r.disabled !== "true")) throw new Error("FastTrack IPv6 actif : validation réseau spécifique requise.");
  if (previous?.baselineKey === plan.baselineKey) {
    const [marker] = await client.talk(["/system/script/environment/print", "=.proplist=name,value", "?name=slhFupReady"], 15000);
    if (!marker || marker.value !== "true") throw new Error("Redémarrage détecté : rapprocher le compteur Starlink avant de rétablir Internet.");
  }

  // Compile the script without executing its forwarding changes.
  await upsert(client, "/system/script", "name", "slh-fup-verify", {
    source: `:local verified [:parse ${quoteRos(plan.script)}]; :put "FUP compiled"`, policy: "read,write,policy,test",
  });
  try { await client.talk(["/system/script/run", `=number=${(await scriptIndex(client)).get("slh-fup-verify")![".id"]}`], 30000); }
  finally { await removeScript(client, "slh-fup-verify"); }

  const backup = previous?.backup ?? `slh-before-fup-${Date.now()}`;
  if (!previous) await client.talk(["/system/backup/save", `=name=${backup}`], 20000);
  const fastTrackIds = [...new Set([...(previous?.fastTrackIds ?? []), ...ft.filter(r => r.disabled !== "true").map(r => r[".id"])])];
  try {
  for (const id of fastTrackIds) await client.talk(["/ip/firewall/filter/set", `=numbers=${id}`, "=disabled=yes"], 15000);
  // Established FastTracked flows keep bypassing queues until they are removed.
  const connections = await client.talk(["/ip/firewall/connection/print", "=.proplist=.id,fasttrack"], 15000);
  for (const c of connections.filter(c => c.fasttrack === "true" || c.fasttrack === "yes")) {
    await client.talk(["/ip/firewall/connection/remove", `=numbers=${c[".id"]}`], 15000);
  }
  await upsert(client, "/interface/list", "name", FUP_LIST, {});
  for (const { link } of plan.budgets) {
    const [member] = await client.talk(["/interface/list/member/print", `?list=${FUP_LIST}`, `?interface=${link.interface}`], 15000);
    if (!member) await client.talk(["/interface/list/member/add", `=list=${FUP_LIST}`, `=interface=${link.interface}`, `=comment=${OWNER}`], 15000);
  }
  for (const path of ["/ip/firewall/filter", "/ipv6/firewall/filter"]) {
    for (const direction of ["in", "out"]) {
      const comment = `${FUP_STOP}${direction}`;
      const [existing] = await client.talk([`${path}/print`, `?comment=${comment}`], 15000);
      const params = [`=chain=forward`, `=${direction}-interface-list=${FUP_LIST}`, "=action=drop", `=comment=${comment}`];
      await client.talk([`${path}/${existing ? "set" : "add"}`, ...(existing ? [`=numbers=${existing[".id"]}`] : []),
        ...params, `=disabled=${plan.stop ? "no" : "yes"}`], 15000);
      const [rule] = await client.talk([`${path}/print`, `?comment=${comment}`], 15000);
      await client.talk([`${path}/move`, `=numbers=${rule[".id"]}`, "=destination=0"], 15000);
    }
  }
  if (!plan.stop) {
    for (const [direction, classifier, rate] of [["up", "src-address", "128k"], ["down", "dst-address", "256k"]]) {
      await upsert(client, "/queue/type", "name", `slh-fup-${direction}`, { kind: "pcq", "pcq-classifier": classifier, "pcq-rate": plan.reserve ? rate : "0" });
    }
    await upsert(client, "/queue/simple", "name", FUP_QUEUE, {
      target: targets.join(","), "max-limit": `${plan.totalBps}/${plan.totalBps}`, "total-max-limit": `${plan.totalBps}`,
      queue: "slh-fup-up/slh-fup-down", "total-queue": "default-small", "burst-limit": "0/0", disabled: "no",
    });
    const [q] = await client.talk(["/queue/simple/print", `?name=${FUP_QUEUE}`], 15000);
    await client.talk(["/queue/simple/move", `=numbers=${q[".id"]}`, "=destination=0"], 15000);
  }
  await upsert(client, "/system/script", "name", FUP_SCRIPT, { source: plan.script, policy: "read,write,policy,test" });
  await upsert(client, "/system/scheduler", "name", FUP_SCRIPT, { "on-event": FUP_SCRIPT, interval: "5s", "start-time": "startup", policy: "read,write,policy,test", disabled: "no" });
  // The boot marker is deliberately volatile. After reboot the local guard
  // stops Internet until the provider baseline has been reconciled again.
  await upsert(client, "/system/script", "name", "slh-fup-init", { source: ":global slhFupReady true", policy: "read,write,policy,test" });
  try { await client.talk(["/system/script/run", `=number=${(await scriptIndex(client)).get("slh-fup-init")![".id"]}`], 30000); }
  finally { await removeScript(client, "slh-fup-init"); }
  await client.talk(["/system/script/run", `=number=${(await scriptIndex(client)).get(FUP_SCRIPT)![".id"]}`], 30000);
  const rules = await client.talk(["/ip/firewall/filter/print"], 15000);
  if (rules.some(r => r.comment?.startsWith(FUP_STOP) && (r.disabled !== "true") !== plan.stop)) throw new Error("État du garde-fou différent du résultat attendu.");
  if (!plan.stop) {
    const [queue] = await client.talk(["/queue/simple/print", `?name=${FUP_QUEUE}`], 15000);
    if (!queue || Number(queue["total-max-limit"]) !== plan.totalBps || queue.disabled === "true") throw new Error("Plafond partagé non confirmé sur le routeur.");
  }
  return { fastTrackIds, backup, appliedAt: new Date().toISOString(), totalBps: plan.totalBps, reserve: plan.reserve, stopped: plan.stop, baselineKey: plan.baselineKey };
  } catch (error) {
    if (!previous) {
      try { await releaseFupFromRouter(client, { fastTrackIds, backup, appliedAt: "", totalBps: 0, reserve: false, stopped: false }); }
      catch { throw new Error("Installation FUP incomplète : retour arrière à vérifier sur le routeur."); }
    }
    throw error;
  }
}

/** Removes only FUP v2 resources. Existing hotspot tickets are untouched. */
export async function releaseFupFromRouter(client: RouterOSClient, runtime: FupRuntime | null) {
  const [scheduler] = await client.talk(["/system/scheduler/print", `?name=${FUP_SCRIPT}`], 15000);
  if (scheduler?.comment === OWNER) await client.talk(["/system/scheduler/set", `=numbers=${scheduler[".id"]}`, "=disabled=yes"], 15000);
  for (const path of ["/ip/firewall/filter", "/ipv6/firewall/filter"]) {
    const rules = await client.talk([`${path}/print`], 15000);
    for (const r of rules.filter(r => r.comment?.startsWith(FUP_STOP))) await client.talk([`${path}/remove`, `=numbers=${r[".id"]}`], 15000);
  }
  for (const [path, field, value] of [["/system/scheduler", "name", FUP_SCRIPT], ["/system/script", "name", FUP_SCRIPT],
    ["/queue/simple", "name", FUP_QUEUE], ["/queue/type", "name", "slh-fup-up"], ["/queue/type", "name", "slh-fup-down"],
    ["/interface/list/member", "list", FUP_LIST], ["/interface/list", "name", FUP_LIST]]) {
    const rows = await client.talk([`${path}/print`, "=.proplist=.id,name,comment", `?${field}=${value}`], path === "/system/script" ? 60000 : 15000);
    for (const row of rows.filter(r => r.comment === OWNER)) {
      if (path === "/system/script") {
        (await scriptIndex(client)).set(row.name, row);
        await removeScript(client, row.name);
      }
      else await client.talk([`${path}/remove`, `=numbers=${row[".id"]}`], 15000);
    }
  }
  for (const id of runtime?.fastTrackIds ?? []) {
    const [rule] = await client.talk(["/ip/firewall/filter/print", `?.id=${id}`], 15000);
    if (rule?.action === "fasttrack-connection") await client.talk(["/ip/firewall/filter/set", `=numbers=${id}`, "=disabled=no"], 15000);
  }
}
