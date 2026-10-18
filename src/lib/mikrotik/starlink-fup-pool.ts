import { calculateFupBudget, validateFupLinks, type FupLink, type FupLedger } from './starlink-fup';

/** SaaS management envelope, not a transfer of contractual Starlink allowances. */
export function calculateFupPool(links: FupLink[], ledger: Record<string,FupLedger>, at: Date) {
  const quotaGB=links.reduce((n,l)=>n+l.quotaGB,0);
  const reserveGB=links.reduce((n,l)=>n+l.reserveGB,0);
  const usedBytes=links.reduce((n,l)=>n+(ledger[l.id]?.cycleUsedBytes ?? NaN),0);
  const known=Number.isSafeInteger(quotaGB*1e9) && Number.isSafeInteger(usedBytes) && !validateFupLinks(links) && links.every(l=>calculateFupBudget(l,ledger[l.id]??null,at).phase!=='unknown');
  const usedGB=known ? usedBytes/1e9:null;
  const remainingGB=usedGB===null?null:Math.max(0,quotaGB-usedGB);
  const endsAt=links.length && !validateFupLinks(links) ? new Date(Math.min(...links.map(l=>Date.parse(l.cycleEnd)))).toISOString():null;
  const daysRemaining=endsAt?(Date.parse(endsAt)-at.getTime())/86400000:0;
  // The reserve is an alert threshold in pooled mode, not an additional withheld allowance.
  const dailyBudgetGB=remainingGB!==null && daysRemaining>0?remainingGB/daysRemaining:null;
  const phase=remainingGB===null?'unknown':remainingGB<=0?'exhausted':remainingGB<=reserveGB?'reserve':'normal';
  return {quotaGB,reserveGB,usedGB,remainingGB,endsAt,dailyBudgetGB,phase,
    aggregateBps:dailyBudgetGB===null?null:Math.floor(dailyBudgetGB*1e9*8/86400),
    windows:[7,14,21,28].map(days=>({days,endsAt:endsAt?new Date(Math.min(Date.parse(endsAt),at.getTime()+days*86400000)).toISOString():null,budgetGB:dailyBudgetGB===null?null:dailyBudgetGB*Math.min(days,daysRemaining)})),
  };
}
