/**
 * exchangeRates.tsx
 * ==================
 * Live USD -> currency conversion rates AND price-level (PPP) ratios,
 * fetched once from the backend (GET /exchange-rates, which itself
 * proxies/caches open.er-api.com and api.worldbank.org - see
 * backend-server/app/exchange_rates.py) and shared across the app via
 * context, same pattern as lib/profile.tsx.
 *
 * fault_knowledge's typical_cost_low/high (and the costLow/costHigh
 * snapshotted onto saved conversations) are always stored in USD - see
 * knowledge_base/fault_knowledge.json - so every screen that displays a
 * price should run it through convert() rather than showing the raw number
 * under a different currency's symbol. convert() does two things at once:
 * the FX rate turns the number into the user's currency, and the
 * price-level ratio then scales it toward what's actually realistic in
 * that country - a US price converted at the FX rate alone is still a US
 * price, not a local one.
 *
 * Not tied to login/session - exchange rates aren't per-user - so this can
 * sit outside AuthProvider/ProfileProvider in _layout.tsx.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getExchangeRates } from "./api";

interface ExchangeRatesContextValue {
  rates: Record<string, number>;
  priceLevelRatios: Record<string, number>;
  isLoading: boolean;
  /** Converts a USD amount into the given currency code AND localizes it
   * via that country's price-level ratio, rounded to a whole unit. Falls
   * back to 1 (no scaling) for either factor if rates/ratios haven't
   * loaded yet or that currency code isn't in the table - so a slow/failed
   * fetch degrades to "shows USD-ish numbers" rather than blocking the
   * price from rendering at all. */
  convert: (amountUsd: number, code: string) => number;
}

const ExchangeRatesContext = createContext<ExchangeRatesContextValue | null>(null);

export function ExchangeRatesProvider({ children }: { children: ReactNode }) {
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [priceLevelRatios, setPriceLevelRatios] = useState<Record<string, number>>({ USD: 1 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getExchangeRates()
      .then((res) => {
        setRates(res.rates);
        setPriceLevelRatios(res.price_level_ratios ?? { USD: 1 });
      })
      .catch(() => {
        // Backend unreachable or the route itself failed - keep the
        // USD-only defaults so convert() just no-ops instead of throwing.
      })
      .finally(() => setIsLoading(false));
  }, []);

  const convert = (amountUsd: number, code: string): number => {
    const rate = rates[code] ?? 1;
    const priceLevelRatio = priceLevelRatios[code] ?? 1;
    return Math.round(amountUsd * rate * priceLevelRatio);
  };

  return (
    <ExchangeRatesContext.Provider value={{ rates, priceLevelRatios, isLoading, convert }}>
      {children}
    </ExchangeRatesContext.Provider>
  );
}

export function useExchangeRates() {
  const ctx = useContext(ExchangeRatesContext);
  if (!ctx) throw new Error("useExchangeRates must be used within an ExchangeRatesProvider");
  return ctx;
}
