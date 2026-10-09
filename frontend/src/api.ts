import { useEffect, useRef, useState } from "react";

export type ScanStatus = "pending" | "processing" | "done" | "failed";

export type Prices = Record<string, unknown> | null;

export interface Card {
  id: number;
  tcggo_id: number;
  name: string;
  card_number: string | null;
  supertype: string | null;
  rarity: string | null;
  hp: number | null;
  set: { id: number | null; name: string | null; code: string | null };
  artist: string | null;
  image_url: string | null;
  tcggo_url: string | null;
  prices: Prices;
  updated_at: string;
  times_scanned?: number;
}

export interface PricePoint {
  source: string;
  tier: string;
  price: string;
  currency: string | null;
  sample_size: number | null;
  fetched_at: string;
}

export interface CardDetail extends Card {
  price_history: PricePoint[];
}

export interface Vision {
  name?: string | null;
  card_number?: string | null;
  confidence?: number | null;
  [key: string]: unknown;
}

export interface Scan {
  scan_id: string;
  status: ScanStatus;
  device_id: string | null;
  error: string | null;
  vision: Vision | null;
  card_id: number | null;
  card: Card | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  scans: (limit = 24) => get<Scan[]>(`/scans?limit=${limit}`),
  cards: (limit = 200) => get<Card[]>(`/cards?limit=${limit}`),
  card: (id: number) => get<CardDetail>(`/cards/${id}`),
  scanImage: (id: string) => `${BASE}/scans/${id}/image`,
  async retry(id: string) {
    const res = await fetch(`${BASE}/scans/${id}/retry`, { method: "POST" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  },
  async upload(file: Blob): Promise<{ scan_id: string }> {
    const body = new FormData();
    body.append("file", file, "scan.jpg");
    const res = await fetch(`${BASE}/scans`, {
      method: "POST",
      body,
      headers: { "X-Device-Id": "web" },
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.detail ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
};

/** Calls `fn` now and then every `ms` milliseconds; `refresh()` re-runs it immediately. */
export function usePoll<T>(fn: () => Promise<T>, ms: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const next = await fnRef.current();
        if (alive) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
      if (alive) timer = setTimeout(run, ms);
    };
    run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ms, tick]);

  return { data, error, refresh: () => setTick((t) => t + 1) };
}
