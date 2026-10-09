import { ExternalLink, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api, type Card, type CardDetail } from "../api";
import { formatMoney, headlinePrice, isRegional, priceRows, sourceLabel, tierLabel } from "../price";
import { HoloCard } from "./HoloCard";
import { Sparkline } from "./Sparkline";

export function CardModal({ card, onClose }: { card: Card; onClose: () => void }) {
  const [detail, setDetail] = useState<CardDetail | null>(null);

  useEffect(() => {
    api.card(card.id).then(setDetail).catch(() => setDetail(null));
  }, [card.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const main = headlinePrice(card.prices);
  const rows = useMemo(() => priceRows(card.prices).filter((r) => r.value > 0), [card.prices]);
  const bySource = useMemo(() => {
    const groups = new Map<string, typeof rows>();
    for (const r of rows.filter((r) => !isRegional(r.tier))) {
      groups.set(r.source, [...(groups.get(r.source) ?? []), r]);
    }
    return [...groups.entries()];
  }, [rows]);
  const history = useMemo(() => {
    if (!detail || !main) return [];
    return detail.price_history
      .filter((p) => p.source === main.source && p.tier === main.tier)
      .sort((a, b) => a.fetched_at.localeCompare(b.fetched_at))
      .map((p) => Number(p.price));
  }, [detail, main]);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ y: 40, scale: 0.95, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 40, scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="glass relative grid w-full max-w-4xl gap-8 rounded-[2rem] bg-panel/80 p-6 sm:p-8 md:grid-cols-[minmax(0,320px)_1fr]"
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>

          {card.image_url && <HoloCard src={card.image_url} alt={card.name} idle className="mx-auto w-full max-w-[320px]" />}

          <div className="min-w-0 space-y-6">
            <div>
              <h2 className="pr-10 text-4xl font-bold tracking-tight">{card.name}</h2>
              <p className="mt-1 text-white/60">
                {card.set.name}
                {card.card_number && <span className="font-mono text-white/40"> · #{card.card_number}</span>}
              </p>
              <p className="mt-3 text-sm text-white/40">
                {[card.rarity, card.supertype, card.hp && `${card.hp} HP`, card.artist && `Illus. ${card.artist}`]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>
            </div>

            {main && (
              <div className="rounded-3xl bg-black/30 p-5 ring-1 ring-white/10">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
                  {sourceLabel(main.source)} · {tierLabel(main.tier)}
                </p>
                <p className="text-holo font-mono text-5xl font-bold">{formatMoney(main.value, main.currency)}</p>
                {history.length > 1 && <Sparkline values={history} className="mt-4 h-20 w-full" />}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {bySource.map(([source, list]) => (
                <div key={source} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/5">
                  <p className="mb-2 text-sm font-semibold">{sourceLabel(source)}</p>
                  <dl className="space-y-1 text-sm">
                    {list.map((r) => (
                      <div key={r.tier} className="flex justify-between gap-4">
                        <dt className="text-white/50">{tierLabel(r.tier)}</dt>
                        <dd className="font-mono">{formatMoney(r.value, r.currency)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-white/50">
              {card.times_scanned != null && <span>Scanned {card.times_scanned}×</span>}
              {card.tcggo_url && (
                <a href={card.tcggo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/70 hover:text-white">
                  View on TCGGO <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
