import { motion } from "motion/react";
import { api, type Scan } from "../api";
import { formatMoney, headlinePrice, timeAgo } from "../price";
import { StatusPill } from "./StatusPill";

interface Props {
  scans: Scan[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}

export function ScanFeed({ scans, activeId, onSelect }: Props) {
  if (scans.length === 0) return null;
  return (
    <section>
      <h3 className="mb-3 px-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Recent scans</h3>
      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {scans.map((scan, i) => {
          const price = scan.card ? headlinePrice(scan.card.prices) : null;
          const active = scan.scan_id === activeId;
          return (
            <motion.button
              key={scan.scan_id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
              onClick={() => onSelect(scan.scan_id)}
              className={`group relative w-32 shrink-0 snap-start overflow-hidden rounded-2xl text-left ring-2 transition sm:w-36 ${
                active ? "ring-white/90" : "ring-white/5 hover:ring-white/30"
              }`}
            >
              <div className="aspect-[63/88] bg-black/50">
                <img
                  src={scan.card?.image_url ?? api.scanImage(scan.scan_id)}
                  alt={scan.card?.name ?? "Scan"}
                  loading="lazy"
                  className={`size-full object-cover transition duration-500 group-hover:scale-105 ${
                    scan.status === "failed" ? "opacity-40 grayscale" : ""
                  }`}
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2.5 pt-8">
                <p className="truncate text-sm font-semibold">{scan.card?.name ?? scan.vision?.name ?? "…"}</p>
                <p className="font-mono text-[11px] text-white/50">
                  {price ? formatMoney(price.value, price.currency) : timeAgo(scan.created_at)}
                </p>
              </div>
              {scan.status !== "done" && <StatusPill status={scan.status} className="absolute left-2 top-2" />}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
