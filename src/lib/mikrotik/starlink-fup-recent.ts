import {calculateFupBudget, type FupLink, type FupLedger} from './starlink-fup';

/** Cron may already be enforcing under the ledger lock. Reuse its fresh,
 * confirmed sample rather than queue another write behind that enforcement. */
export function recentFupMeasurements(links:FupLink[], ledger:Record<string,FupLedger>, at:Date) {
  if (!links.length) return null;
  const result=[];
  for (const link of links) {
    const sample=ledger[link.id];
    const age=sample ? at.getTime()-Date.parse(sample.at) : NaN;
    if (!Number.isFinite(age) || age<0 || age>30000) return null;
    const budget=calculateFupBudget(link,sample,at);
    if (budget.phase==='unknown') return null;
    result.push({id:link.id,cycleConfirmed:link.cycleConfirmed,...sample,budget});
  }
  return result;
}
