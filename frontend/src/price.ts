import type { Prices } from "./api";

export interface PriceRow {
  source: string;
  tier: string;
  value: number;
  currency: string | null;
}

const PREFERRED: [string, string][] = [
  ["cardmarket", "lowest_near_mint"],
  ["cardmarket", "30d_average"],
  ["cardmarket", "7d_average"],
  ["tcg_player", "market_price"],
  ["tcg_player", "mid_price"],
];

const SKIP = new Set(["currency", "available_items", "sample_size"]);

const SOURCE_LABELS: Record<string, string> = {
  cardmarket: "Cardmarket",
  tcg_player: "TCGplayer",
  ebay: "eBay",
};

/** Same walk as the backend's flatten_prices: one row per numeric leaf (or median_price node). */
export function priceRows(prices: Prices): PriceRow[] {
  const rows: PriceRow[] = [];
  for (const [source, data] of Object.entries(prices ?? {})) {
    if (!data || typeof data !== "object") continue;
    const currency = typeof (data as Record<string, unknown>).currency === "string"
      ? ((data as Record<string, unknown>).currency as string)
      : null;
    const walk = (node: unknown, path: string[]) => {
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        if ("median_price" in obj) {
          if (typeof obj.median_price === "number") {
            rows.push({ source, tier: path.join("."), value: obj.median_price, currency });
          }
          return;
        }
        for (const [key, value] of Object.entries(obj)) {
          if (!SKIP.has(key)) walk(value, [...path, key]);
        }
      } else if (typeof node === "number") {
        rows.push({ source, tier: path.join("."), value: node, currency });
      }
    };
    walk(data, []);
  }
  return rows;
}

export function headlinePrice(prices: Prices): PriceRow | null {
  const rows = priceRows(prices);
  for (const [source, tier] of PREFERRED) {
    const hit = rows.find((r) => r.source === source && r.tier === tier && r.value > 0);
    if (hit) return hit;
  }
  return rows.find((r) => !r.tier.includes(".") && r.value > 0) ?? null;
}

export function formatMoney(value: number, currency: string | null, digits = 2) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency ?? ""}`.trim();
  }
}

export function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, " ");
}

/** Secondary prices worth showing next to the headline one, in order. */
const HIGHLIGHTS: [string, string][] = [
  ["cardmarket", "30d_average"],
  ["tcg_player", "market_price"],
  ["ebay", "graded.psa.10"],
];

export function highlightPrices(prices: Prices, exclude: PriceRow | null): PriceRow[] {
  const rows = priceRows(prices);
  return HIGHLIGHTS.flatMap(([source, tier]) => {
    if (exclude && exclude.source === source && exclude.tier === tier) return [];
    const hit = rows.find((r) => r.source === source && r.tier === tier && r.value > 0);
    return hit ? [hit] : [];
  });
}

/** Cardmarket's per-country / EU-only variants of lowest_near_mint. */
export function isRegional(tier: string) {
  return /_(DE|ES|FR|IT|EU_only)/.test(tier);
}

export function tierLabel(tier: string) {
  const graded = tier.match(/^graded\.([a-z]+)\.(.+)$/);
  if (graded) return `${graded[1].toUpperCase()} ${graded[2]}`;
  const text = tier.replace(/[._]/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
