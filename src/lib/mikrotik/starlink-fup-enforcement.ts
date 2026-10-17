import { calculateFupBudget, validateFupLinks, type FupLink, type FupLedger } from "./starlink-fup";
import { quoteRos } from "./content-filter";

export const FUP_QUEUE = "slh-fup-shared";
export const FUP_SCRIPT = "slh-fup-local-guard";
export const FUP_BOOT = "slh-fup-boot-guard";
export const FUP_LIST = "slh-fup-wan";
export const FUP_STOP = "slh-fup-stop-";

/** Conservative failover policy: all traffic can fit on ANY configured link. */
export function buildFupEnforcement(links: FupLink[], ledger: Record<string, FupLedger>, at: Date) {
  const invalid = validateFupLinks(links);
  if (invalid) throw new Error(invalid);
  if (links.some(l => !/^[a-zA-Z0-9_. -]{1,64}$/.test(l.interface))) throw new Error("Nom d'interface non pris en charge pour le garde-fou.");
  const budgets = links.map(l => ({ link: l, budget: calculateFupBudget(l, ledger[l.id] ?? null, at) }));
  if (budgets.some(({ link, budget }) => budget.phase === "unknown" || ledger[link.id]?.rawBytes == null || ledger[link.id]?.uptimeSeconds === undefined)) {
    throw new Error("Référence récente par WAN et cycle confirmé requis avant toute limitation.");
  }
  // One GB stays unused as a guard band for the local 5-second polling interval,
  // counter granularity and packets already in flight. This is not a provider meter.
  const stop = budgets.some(({ budget }) => (budget.remainingGB ?? 0) <= 1);
  const totalBps = stop ? 0 : Math.floor(Math.min(...budgets.map(b => b.budget.aggregateBps!)) * 0.95);
  if (!stop && totalBps < 1) throw new Error("Budget trop faible pour un débit positif : ne pas créer une file illimitée.");
  const reserve = budgets.some(b => b.budget.phase === "reserve");
  const block = `/ip firewall filter set [find where comment~"^${FUP_STOP}"] disabled=no; /ipv6 firewall filter set [find where comment~"^${FUP_STOP}"] disabled=no`;
  const parts = [
    ":local safe true",
    ':local d [/system clock get date]',
    ':if ([:len $d] != 10 || [:pick $d 4 5] != "-" || [:pick $d 7 8] != "-") do={ :error "FUP invalid clock format" }',
    ':local today [:tonum ([:pick $d 0 4] . [:pick $d 5 7] . [:pick $d 8 10])]',
    ...budgets.flatMap(({ link, budget }) => {
      const row = ledger[link.id];
      const allowed = Math.max(0, Math.floor((budget.remainingGB! - 1) * 1e9));
      const end = link.cycleEnd.slice(0, 10).replaceAll("-", "");
      return [
        `:if ($today >= ${end}) do={ :set safe false }`,
        `:local i [/interface find where name=${quoteRos(link.interface)}]`,
        ':if ([:len $i] != 1) do={ :error "FUP WAN missing" }',
        ':local cur ([/interface get $i rx-byte] + [/interface get $i tx-byte])',
        `:if ($cur < ${row.rawBytes} || ($cur - ${row.rawBytes}) >= ${allowed}) do={ :set safe false }`,
      ];
    }),
    // Other throughput optimizers must not silently re-enable a bypass.
    '/ip firewall filter set [find where action="fasttrack-connection"] disabled=yes',
    ...(!stop ? [`/queue simple move [find where name="${FUP_QUEUE}"] destination=0`] : []),
    // Local checks can only STOP forwarding, never silently restore credit.
    // Only the server, after a confirmed baseline, may disable the stop rules.
    `:if ($safe = false) do={ ${block} }`,
  ];
  if (stop) parts.splice(2, 0, ":set safe false");
  return { stop, totalBps, reserve, budgets,
    baselineKey: links.map(l => `${l.id}:${ledger[l.id].baselineAt ?? ledger[l.id].at}`).join("|"),
    bootScript: block,
    script: `:do { ${parts.join("; ")} } on-error={ ${block}; :log error "SafeLinkHub FUP: verification locale impossible, Internet suspendu" }`,
  };
}
