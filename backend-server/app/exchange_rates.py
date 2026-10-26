"""
exchange_rates.py
==================
Two related but distinct localizations for fault_knowledge's stored cost
figures (all in USD - see knowledge_base/fault_knowledge.json, which is
hand-researched from US repair-cost articles, not live data):

1. get_rates() - live USD -> currency exchange rates, so a price can be
   *displayed* in the user's chosen currency.
2. get_price_level_ratios() - how much cheaper/more expensive each
   country's overall price level is relative to the US, so the estimate
   itself can be *scaled* rather than just currency-converted. Currency
   conversion alone still shows a literal "US price, different symbol" -
   a $350 US wheel-bearing job doesn't actually cost the FX-converted
   equivalent in a country with much lower labor costs. This is the
   "formulaic" workaround for the fact that no free, automotive-specific,
   per-country repair-cost database exists: take the US baseline and scale
   it by a general cost-of-living proxy instead.

   The ratio comes from the World Bank's free, no-key API: PPP conversion
   factor (PA.NUS.PPP, local currency per international $) divided by the
   official market exchange rate (PA.NUS.FCRF, local currency per US$) for
   the country tied to each currency. This is a real, standard economics
   concept - a "Price Level Index" - and for the US itself it's 1.0 by
   construction, since PPP and market FX are the same thing there.

   Example (Malaysia, verified live while building this): PPP 1.40
   MYR/int'l$, market FX 4.58 MYR/US$, ratio ~0.31 - Malaysia's domestic
   price level runs at about 31% of the US's once currency is accounted
   for, which lines up with reality far better than a flat FX conversion.

   Caveat worth remembering: this is a whole-economy proxy, not an
   automotive-specific one. It moves the estimate meaningfully closer to
   reality, but it's still a model, not a literal local shop quote.

Both are cached in-process (long TTL - this data barely moves) and fall
back to the last successful fetch, then a hardcoded table, so a network
hiccup never breaks price display, only makes it briefly less precise. Per
this project's rule that the mobile app never talks to a third party
directly (only this backend's HTTP API - see api.ts's header comment), the
mobile client calls GET /exchange-rates on this backend, never
open.er-api.com or worldbank.org directly.
"""

from datetime import datetime, timedelta, timezone

import httpx

RATES_URL = "https://open.er-api.com/v6/latest/USD"
WORLD_BANK_BASE = "https://api.worldbank.org/v2/country"

# Keep this in sync with mobile-app/src/constants/currency.ts's CURRENCIES -
# no point caching/returning currencies the app doesn't offer a picker for.
SUPPORTED_CURRENCIES = ["USD", "MYR", "SGD"]

# Rough, hand-set rates as of writing - ONLY used if we've never once
# successfully reached open.er-api.com (so the app never shows a hard
# error just because the very first request raced a slow network). Real
# rates from the API replace this the moment any fetch succeeds.
_FALLBACK_RATES = {"USD": 1.0, "MYR": 4.2, "SGD": 1.29}

_CACHE_TTL = timedelta(hours=12)

_cache: dict = {"rates": None, "fetched_at": None}

# Which World Bank country each supported currency's price level is judged
# against. USD is deliberately absent - it's the US-dollar baseline this
# whole system is scaled from, so its ratio is always exactly 1.0 and never
# needs a live fetch. If a currency is ever added that isn't tied to one
# obvious country, this mapping is where that gets decided.
_PPP_COUNTRY_FOR_CURRENCY = {"MYR": "MYS", "SGD": "SGP"}

# Verified live against the World Bank API while building this (2024 data,
# the most recent year both PA.NUS.PPP and PA.NUS.FCRF had values for both
# countries) - only used if we've never once successfully computed a live
# ratio for that currency.
_PRICE_LEVEL_FALLBACK = {"USD": 1.0, "MYR": 0.31, "SGD": 0.62}

_PRICE_LEVEL_CACHE_TTL = timedelta(days=30)  # annual data - no point refetching often

_price_level_cache: dict = {"ratios": None, "fetched_at": None}


class ExchangeRateError(Exception):
    """Raised only when there's truly nothing to serve - no fresh fetch and
    no prior cache. Callers should treat this as "conversion unavailable
    right now", not a fatal error."""


def _is_fresh() -> bool:
    return (
        _cache["rates"] is not None
        and _cache["fetched_at"] is not None
        and datetime.now(timezone.utc) - _cache["fetched_at"] < _CACHE_TTL
    )


async def get_rates() -> dict:
    """Returns {"USD": 1.0, "MYR": 4.09, "SGD": 1.28, ...} - trimmed to
    SUPPORTED_CURRENCIES. Never raises for a transient upstream failure;
    only raises if there's no cache AND the hardcoded fallback somehow
    doesn't cover a requested currency (shouldn't happen in practice)."""
    if _is_fresh():
        return _cache["rates"]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(RATES_URL)
        resp.raise_for_status()
        data = resp.json()
        all_rates = data["rates"]
        trimmed = {code: all_rates[code] for code in SUPPORTED_CURRENCIES if code in all_rates}
        _cache["rates"] = trimmed
        _cache["fetched_at"] = datetime.now(timezone.utc)
        return trimmed
    except Exception:
        # Network error, non-200, or unexpected JSON shape - all treated the
        # same way: fall back to whatever we've got. Logged by the caller
        # (main.py), not here, to avoid a second logger dependency in this
        # small module.
        if _cache["rates"] is not None:
            return _cache["rates"]
        return dict(_FALLBACK_RATES)


def last_updated() -> str | None:
    """ISO timestamp of the last successful live fetch, or None if we've
    only ever served the hardcoded fallback - lets the app show "rates as
    of ..." or silently skip that label rather than lying about freshness."""
    if _cache["fetched_at"] is None:
        return None
    return _cache["fetched_at"].isoformat()


def _price_level_is_fresh() -> bool:
    return (
        _price_level_cache["ratios"] is not None
        and _price_level_cache["fetched_at"] is not None
        and datetime.now(timezone.utc) - _price_level_cache["fetched_at"] < _PRICE_LEVEL_CACHE_TTL
    )


async def _fetch_world_bank_series(client: httpx.AsyncClient, country: str, indicator: str) -> dict[str, float]:
    """Returns {"2024": 1.399, "2023": 1.423, ...} for the last several
    years, skipping null entries - the World Bank publishes a year or two
    behind, and not every country reports every year, so pulling a range
    and picking the latest usable year is more robust than assuming the
    current year has data."""
    url = f"{WORLD_BANK_BASE}/{country}/indicator/{indicator}"
    resp = await client.get(url, params={"format": "json", "per_page": 10})
    resp.raise_for_status()
    payload = resp.json()
    # The API's own error responses (bad indicator/country) come back as a
    # single-element list with a "message" key instead of the usual
    # [metadata, data] pair - treat that as "no data" rather than crashing.
    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        return {}
    return {row["date"]: row["value"] for row in payload[1] if row.get("value") is not None}


async def _fetch_price_level_ratio(client: httpx.AsyncClient, country: str) -> float | None:
    """ratio = PPP conversion factor / official market exchange rate, both
    in local-currency-per-dollar terms, for the most recent year both
    indicators reported a value (so the comparison isn't skewed by mixing
    a PPP figure from one year with an exchange rate from another)."""
    ppp = await _fetch_world_bank_series(client, country, "PA.NUS.PPP")
    fx = await _fetch_world_bank_series(client, country, "PA.NUS.FCRF")
    common_years = sorted(set(ppp) & set(fx), reverse=True)
    if not common_years or fx[common_years[0]] == 0:
        return None
    latest = common_years[0]
    return ppp[latest] / fx[latest]


async def get_price_level_ratios() -> dict[str, float]:
    """Returns {"USD": 1.0, "MYR": 0.31, "SGD": 0.62, ...} - how expensive
    each supported currency's country is relative to the US, for scaling
    (not just currency-converting) fault_knowledge's USD cost baseline.
    Same never-raise, fall-back-to-last-good-or-hardcoded behavior as
    get_rates()."""
    if _price_level_is_fresh():
        return _price_level_cache["ratios"]

    ratios: dict[str, float] = {"USD": 1.0}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for currency, country in _PPP_COUNTRY_FOR_CURRENCY.items():
                ratio = await _fetch_price_level_ratio(client, country)
                ratios[currency] = ratio if ratio is not None else _PRICE_LEVEL_FALLBACK[currency]
        _price_level_cache["ratios"] = ratios
        _price_level_cache["fetched_at"] = datetime.now(timezone.utc)
        return ratios
    except Exception:
        if _price_level_cache["ratios"] is not None:
            return _price_level_cache["ratios"]
        return dict(_PRICE_LEVEL_FALLBACK)


def price_levels_last_updated() -> str | None:
    if _price_level_cache["fetched_at"] is None:
        return None
    return _price_level_cache["fetched_at"].isoformat()
