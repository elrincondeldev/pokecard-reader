import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Card } from "../api";
import { formatMoney, headlinePrice } from "../price";
import { CardModal } from "./CardModal";
import { CountUp } from "./CountUp";

export function Collection({ cards }: { cards: Card[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Card | null>(null);

  const sorted = useMemo(
    () =>
      cards
        .map((card) => ({ card, price: headlinePrice(card.prices) }))
        .filter(({ card }) => `${card.name} ${card.set.name ?? ""}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => (b.price?.value ?? 0) - (a.price?.value ?? 0)),
    [cards, query],
  );
  const total = useMemo(() => totalValue(cards), [cards]);
  const scans = cards.reduce((n, c) => n + (c.times_scanned ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Collection value">
          {total ? <CountUp value={total.value} currency={total.currency} /> : "—"}
        </Stat>
        <Stat label="Unique cards">{cards.length}</Stat>
        <Stat label="Scans">{scans}</Stat>
      </div>

      <label className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <Search className="size-4 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your cards…"
          className="w-full bg-transparent outline-none placeholder:text-white/30"
        />
      </label>

      {sorted.length === 0 ? (
        <p className="py-20 text-center text-white/40">{cards.length ? "No matches." : "No cards yet — scan one!"}</p>
      ) : (
        <motion.div layout className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {sorted.map(({ card, price }, i) => (
            <motion.button
              layout
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 15) * 0.04 }}
              whileHover={{ y: -6, rotate: -1 }}
              onClick={() => setOpen(card)}
              className="group text-left"
            >
              <div className="relative aspect-[63/88] overflow-hidden rounded-xl bg-black/40 shadow-xl ring-1 ring-white/10 transition group-hover:shadow-[0_20px_50px_-10px_rgba(155,123,255,0.6)]">
                {card.image_url && (
                  <img src={card.image_url} alt={card.name} loading="lazy" className="size-full object-cover" />
                )}
                <div className="holo-shine opacity-0 transition group-hover:opacity-30" />
                {i < 3 && !query && price && (
                  <span className="absolute left-2 top-2 rounded-full bg-poke px-2 py-0.5 font-mono text-[10px] font-bold text-black">
                    #{i + 1}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2 px-0.5">
                <p className="truncate text-sm font-semibold">{card.name}</p>
                {price && <p className="shrink-0 font-mono text-xs text-emerald-300">{formatMoney(price.value, price.currency)}</p>}
              </div>
              <p className="truncate px-0.5 text-xs text-white/40">{card.set.name}</p>
            </motion.button>
          ))}
        </motion.div>
      )}

      <AnimatePresence>{open && <CardModal card={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-3 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 sm:text-[11px]">{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-bold sm:text-3xl">{children}</p>
    </div>
  );
}

/** Sum headline prices per currency and keep the currency with the largest total. */
export function totalValue(cards: Card[]) {
  const sums = new Map<string, number>();
  for (const card of cards) {
    const p = headlinePrice(card.prices);
    if (p) sums.set(p.currency ?? "EUR", (sums.get(p.currency ?? "EUR") ?? 0) + p.value);
  }
  const best = [...sums.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { currency: best[0], value: best[1] } : null;
}
