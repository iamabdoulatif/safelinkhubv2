/** One Safecoin is represented by 100 integer subunits in the ledger. */
export const SC_SCALE = 100;
export const DEFAULT_SC_RATE_FCFA = 100;
export const SC_CURRENCY = "SC" as const;

export type SafecoinEntryType =
  | "topup"
  | "vpn_charge"
  | "auto_setup_charge"
  | "fee"
  | "admin_credit"
  | "admin_debit"
  | "refund"
  | "reversal";

export type SafecoinEntryStatus = "pending" | "completed" | "failed";
