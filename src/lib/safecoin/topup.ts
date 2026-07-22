import { fcfaToScCents } from "./pricing";

export function parseSafecoinTopupAmount(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(amount) || amount < 100) {
    throw new Error("Le montant doit être supérieur ou égal à 100 FCFA.");
  }
  if (amount > 5_000_000) throw new Error("Le montant maximum est de 5 000 000 FCFA.");
  return amount;
}

export function safecoinTopupScCents(amountFcfa: number, rateFcfaPerSc = 100) {
  return fcfaToScCents(parseSafecoinTopupAmount(amountFcfa), rateFcfaPerSc);
}
