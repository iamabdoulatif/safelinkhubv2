/** Formes de données de la page Conversion — partagées par la page (qui les
 *  lit en base) et par la vue (qui les rend). */

export type ConversionDay = {
  day: string;
  paid: number;
  reached: number;
  abandoned: number;
  total: number;
};

export type ConversionTotals = {
  paid: number;
  reached: number;
  abandoned: number;
  total: number;
  revenue: number;
};

export type PendingPayment = {
  id: string;
  phone: string;
  profile_name: string | null;
  price_cents: number | null;
  payment_reference: string;
  failure_reason: string | null;
  created_at: string;
};
