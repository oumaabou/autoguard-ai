/**
 * currency.ts
 * ===========
 * Single source of truth for the currency picker in Profile, and for
 * formatting fair-price figures wherever they're shown (Evaluator,
 * History). The selection is a persisted per-user setting (profiles.currency
 * in Supabase, via lib/profile.tsx) rather than a per-screen dropdown, so it
 * stays consistent everywhere.
 *
 * No live FX conversion - fault_knowledge's typical_cost_low/high are
 * stored as plain numbers and shown as-is under whichever symbol is
 * selected, same simplification the original mock data used.
 */

export const CURRENCIES = [
  { code: "MYR", label: "Malaysian Ringgit (RM)", symbol: "RM" },
  { code: "USD", label: "US Dollar (USD)", symbol: "$" },
  { code: "SGD", label: "Singapore Dollar (SGD)", symbol: "SGD" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "MYR";

export function currencySymbol(code: string | null | undefined): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? CURRENCIES.find((c) => c.code === DEFAULT_CURRENCY)!.symbol;
}
