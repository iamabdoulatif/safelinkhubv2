import type { CountryRow } from "./geography";

export type CountryMetric = Pick<CountryRow, "label" | "accounts" | "share">;

export function totalAccounts(countries: CountryRow[]): number {
  return countries.reduce((total, country) => total + country.accounts, 0);
}

export function countryMetrics(countries: CountryRow[], iso2: string): CountryMetric | undefined {
  const normalized = iso2.trim().toUpperCase();
  const country = countries.find((entry) => entry.iso2?.trim().toUpperCase() === normalized);
  return country ? { label: country.label, accounts: country.accounts, share: country.share } : undefined;
}

export function colorBucket(accounts: number, maxAccounts: number): 0 | 1 | 2 | 3 | 4 {
  if (accounts <= 0 || maxAccounts <= 0) return 0;
  const ratio = accounts / maxAccounts;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}
