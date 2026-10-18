import { calculateFupBudget, validateFupLinks, type FupLink, type FupLedger } from "./starlink-fup";
import { calculateFupPool } from "./starlink-fup-pool";
import { quoteRos } from "./content-filter";

export const FUP_QUEUE = "slh-fup-shared";
export const FUP_SCRIPT = "slh-fup-local-guard";
export const FUP_BOOT = "slh-fup-boot-guard";
export const FUP_LIST = "slh-fup-wan";
export const FUP_STOP = "slh-fup-stop-";

/** Individual conservative policy by default; optional pooled SaaS volume envelope. */
export function buildFupEnforcement(links: FupLink[], ledger: Record<string, FupLedger>, at: Date, pooled = false) {
  const invalid = validateFupLinks(links);
  if (invalid) throw new Error(invalid);
  if (links.some(l => !/^[a-zA-Z0-9_. -]{1,64}$/.test(l.interface))) throw new Error("Nom d'interface non pris en charge pour le garde-fou.");
  const budgets = links.map(l => ({ link: l, budget: calculateFupBudget(l, ledger[l.id] ?? null, at) }));
  if (budgets.some(({ link, budget }) => budget.phase === "unknown" || ledger[link.id]?.rawBytes == null || ledger[link.id]?.uptimeSeconds === undefined)) {
    throw new Error("Référence récente par WAN et cycle confirmé requis avant toute limitation.");
  }
  // One GB stays unused as a guard band for the local 5-second polling interval,
  // counter granularity and packets already in flight. This is not a provider meter.
  const pool = pooled ? calculateFupPool(links, ledger, at) : null;
  if (pool?.phase === "unknown") throw new Error("Enveloppe cumulée non confirmée ou hors précision autorisée.");
  const stop = pool ? pool.remainingGB! <= links.length : budgets.some(({ budget }) => (budget.remainingGB ?? 0) <= 1);
  const totalBps = stop ? 0 : Math.floor((pool ? pool.aggregateBps! : Math.min(...budgets.map(b => b.budget.aggregateBps!))) * 0.8);
  if (!stop && totalBps < 2) throw new Error("Budget trop faible pour deux débits positifs : ne pas créer une file illimitée.");
  // Bound the sum of BOTH directions, independently of global-total HTB
  // accounting (which did not match actual WAN bytes on the live HotSpot).
  const uploadBps = stop ? 0 : Math.max(1, Math.floor(totalBps / (pooled ? 2 : 5)));
  const downloadBps = stop ? 0 : totalBps - uploadBps;
  const reserve = pool ? pool.phase === "reserve" : budgets.some(b => b.budget.phase === "reserve");
  const block = `/ip firewall filter set [find where comment~"^${FUP_STOP}"] disabled=no; /ipv6 firewall filter set [find where comment~"^${FUP_STOP}"] disabled=no`;
  const parts = [
    ":local safe true",
    ':local d [/system clock get date]',
    ':if ([:len $d] != 10 || [:pick $d 4 5] != "-" || [:pick $d 7 8] != "-") do={ :error "FUP invalid clock format" }',
    ':local today [:tonum ([:pick $d 0 4] . [:pick $d 5 7] . [:pick $d 8 10])]',
    ...(pooled ? [":local consumed 0"] : []),
    ...budgets.flatMap(({ link, budget }) => {
      const row = ledger[link.id];
      const allowed = Math.max(0, Math.floor((budget.remainingGB! - 1) * 1e9));
      const end = link.cycleEnd.slice(0, 10).replaceAll("-", "");
      return [
        `:if ($today >= ${end}) do={ :set safe false }`,
        `:local i [/interface find where name=${quoteRos(link.interface)}]`,
        ':if ([:len $i] != 1) do={ :error "FUP WAN missing" }',
        ':local cur ([/interface get $i rx-byte] + [/interface get $i tx-byte])',
        ...(pooled ? [
          `:if ($cur < ${row.rawBytes}) do={ :set safe false }`,
          `:set consumed ($consumed + $cur - ${row.rawBytes})`,
        ] : [`:if ($cur < ${row.rawBytes} || ($cur - ${row.rawBytes}) >= ${allowed}) do={ :set safe false }`]),
      ];
    }),
    ...(pool ? [`:if ($consumed >= ${Math.max(0,Math.floor((pool.remainingGB! - links.length)*1e9))}) do={ :set safe false }`] : []),
    // Other throughput optimizers must not silently re-enable a bypass.
    '/ip firewall filter set [find where action="fasttrack-connection"] disabled=yes',
    ...(!stop ? [`:local q [/queue simple find where name="${FUP_QUEUE}"]; :if ([:len $q] != 1) do={ :error "FUP queue missing" }; :local first [:pick [/queue simple find] 0]; :if ([:pick $q 0] != $first) do={ /queue simple move $q destination=$first }`] : []),
    // Local checks can only STOP forwarding, never silently restore credit.
    // Only the server, after a confirmed baseline, may disable the stop rules.
    `:if ($safe = false) do={ ${block} }`,
  ];
  if (stop) parts.splice(2, 0, ":set safe false");
  return { stop, totalBps, uploadBps, downloadBps, reserve, budgets, pooled, pool, ticketRateBps: pooled ? 2000000 : 0,
    baselineKey: (pooled ? "pool:" : "") + links.map(l => `${l.id}:${ledger[l.id].baselineAt ?? ledger[l.id].at}`).join("|"),
    bootScript: block,
    script: `:do { ${parts.join("; ")} } on-error={ ${block}; :log error "SafeLinkHub FUP: verification locale impossible, Internet suspendu" }`,
  };
}
