import { Check, Loader2, RotateCcw, ScanLine, Sparkles, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { api, type Scan } from "../api";
import { formatMoney, headlinePrice, highlightPrices, sourceLabel, tierLabel, timeAgo } from "../price";
import { CountUp } from "./CountUp";
import { HoloCard } from "./HoloCard";
import { Pokeball } from "./Pokeball";
import { StatusPill } from "./StatusPill";

export function Spotlight({ scan, loading, onChanged }: { scan: Scan | undefined; loading: boolean; onChanged: () => void }) {
  const phase = loading ? "loading" : !scan ? "empty" : scan.status === "done" && scan.card ? "done" : scan.status === "failed" ? "failed" : "working";

  return (
    <section className="glass relative overflow-hidden rounded-[2rem] p-5 sm:p-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${scan?.scan_id}-${phase}`}
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {phase === "loading" && <div className="min-h-[420px]" />}
          {phase === "empty" && <Empty />}
          {phase === "working" && scan && <Working scan={scan} />}
          {phase === "done" && scan && <Done scan={scan} />}
          {phase === "failed" && scan && <Failed scan={scan} onChanged={onChanged} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function Empty() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-6 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-white/10" />
        <Pokeball className="pokeball-spin relative size-24 drop-shadow-[0_0_30px_rgba(255,80,120,0.5)]" />
      </div>
      <div>
        <p className="text-2xl font-semibold">Waiting for a card…</p>
        <p className="mt-2 text-white/50">Point the scanner at a card, or tap <b className="text-white/80">Scan</b> to upload a photo.</p>
      </div>
    </div>
  );
}

function ScannerPhoto({ scan, failed = false }: { scan: Scan; failed?: boolean }) {
  return (
    <div className="relative mx-auto aspect-[63/88] w-full max-w-[210px] sm:max-w-[300px] overflow-hidden rounded-2xl bg-black/60 ring-1 ring-white/10">
      <img
        src={api.scanImage(scan.scan_id)}
        alt="Scanned photo"
        className={`size-full object-cover ${failed ? "opacity-50 grayscale" : ""}`}
      />
      {!failed && (
        <>
          <div className="scan-grid" />
          <div className="scan-laser" />
          <span className="bracket left-3 top-3 border-l-2 border-t-2 rounded-tl-lg" />
          <span className="bracket right-3 top-3 border-r-2 border-t-2 rounded-tr-lg" />
          <span className="bracket bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg" />
          <span className="bracket bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg" />
        </>
      )}
      {failed && <div className="absolute inset-0 bg-rose-950/40" />}
    </div>
  );
}

function Working({ scan }: { scan: Scan }) {
  const read = Boolean(scan.vision?.name);
  const steps = [
    { label: "Photo captured", state: "done" },
    { label: "Reading the card with AI", state: read ? "done" : scan.status === "processing" ? "active" : "todo" },
    { label: "Fetching market price", state: read ? "active" : "todo" },
  ] as const;

  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      <ScannerPhoto scan={scan} />
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <StatusPill status={scan.status} />
          <span className="font-mono text-xs text-white/40">{timeAgo(scan.created_at)}</span>
        </div>
        <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {read ? (
            <>
              Looks like <span className="text-holo">{scan.vision?.name}</span>
            </>
          ) : (
            <>
              Scanning<span className="animate-pulse">…</span>
            </>
          )}
        </h2>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <motion.li
              key={step.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className={`flex items-center gap-3 ${step.state === "todo" ? "text-white/30" : "text-white/90"}`}
            >
              <span
                className={`grid size-7 place-items-center rounded-full ring-1 ${
                  step.state === "done"
                    ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40"
                    : step.state === "active"
                      ? "bg-cyan-400/15 text-cyan-300 ring-cyan-400/40"
                      : "ring-white/10"
                }`}
              >
                {step.state === "done" ? (
                  <Check className="size-4" />
                ) : step.state === "active" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-white/30" />
                )}
              </span>
              {step.label}
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Done({ scan }: { scan: Scan }) {
  const card = scan.card!;
  const main = headlinePrice(card.prices);
  const others = useMemo(() => highlightPrices(card.prices, main), [card.prices, main]);
  const fresh = scan.finished_at ? Date.now() - new Date(scan.finished_at).getTime() < 20_000 : false;
  const confidence = typeof scan.vision?.confidence === "number" ? scan.vision.confidence : null;

  return (
    <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-12">
      <motion.div
        className="relative mx-auto w-full max-w-[210px] sm:max-w-[340px]"
        initial={{ rotateY: -100, scale: 0.7, opacity: 0 }}
        animate={{ rotateY: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 70, damping: 14, delay: 0.1 }}
        style={{ transformPerspective: 1200 }}
      >
        {fresh && <Burst />}
        <HoloCard src={card.image_url ?? api.scanImage(scan.scan_id)} alt={card.name} idle />
        <img
          src={api.scanImage(scan.scan_id)}
          alt="Your scan"
          title="Your scan"
          className="absolute -bottom-4 -left-4 w-20 rotate-[-8deg] rounded-lg object-cover shadow-2xl ring-2 ring-white/80 sm:w-24"
        />
      </motion.div>

      <div className="min-w-0 space-y-4 text-center sm:space-y-6 md:text-left">
        <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
          <StatusPill status="done" />
          <span className="font-mono text-xs text-white/40">{timeAgo(scan.finished_at ?? scan.created_at)}</span>
        </div>

        <div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-4xl font-bold leading-[1.05] tracking-tight break-words sm:text-6xl"
          >
            {card.name}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="mt-1 text-base text-white/60 sm:mt-2 sm:text-lg"
          >
            {card.set.name ?? "Unknown set"}
            {card.card_number && <span className="font-mono text-white/40"> · #{card.card_number}</span>}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="flex flex-wrap justify-center gap-2 md:justify-start"
        >
          {card.rarity && <Chip accent>{card.rarity}</Chip>}
          {card.supertype && <Chip>{card.supertype}</Chip>}
          {card.hp && <Chip>{card.hp} HP</Chip>}
          {card.set.code && <Chip>{card.set.code}</Chip>}
        </motion.div>

        {main ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.65, type: "spring", stiffness: 120 }}
            className="rounded-3xl bg-black/30 p-5 ring-1 ring-white/10"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
              {sourceLabel(main.source)} · {tierLabel(main.tier)}
            </p>
            <p className="text-holo mt-1 font-mono text-5xl font-bold tabular-nums sm:text-6xl">
              <CountUp value={main.value} currency={main.currency} />
            </p>
            {others.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm md:justify-start">
                {others.map((r) => (
                  <span key={`${r.source}.${r.tier}`} className="text-white/50">
                    {r.source === main.source ? tierLabel(r.tier) : `${sourceLabel(r.source)} ${tierLabel(r.tier)}`}{" "}
                    <b className="font-mono text-white/90">{formatMoney(r.value, r.currency)}</b>
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <p className="text-white/50">No market price available yet.</p>
        )}

        {confidence !== null && (
          <div className="space-y-1.5">
            <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3" /> AI confidence
              </span>
              <span className="text-white/70">{Math.round(confidence * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400"
                initial={{ width: 0 }}
                animate={{ width: `${confidence * 100}%` }}
                transition={{ delay: 0.8, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Failed({ scan, onChanged }: { scan: Scan; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      <ScannerPhoto scan={scan} failed />
      <div className="space-y-5">
        <StatusPill status="failed" />
        <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">
          <TriangleAlert className="size-8 shrink-0 text-rose-400" /> Couldn’t read that one
        </h2>
        <p className="rounded-2xl bg-rose-500/10 p-4 font-mono text-sm text-rose-200/80 ring-1 ring-rose-400/20">
          {scan.error ?? "Unknown error"}
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.retry(scan.scan_id);
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-semibold text-black transition hover:scale-[1.03] active:scale-95 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Try again
        </button>
        <p className="flex items-center gap-2 text-sm text-white/40">
          <ScanLine className="size-4" /> Tip: fill the frame and avoid glare on the card.
        </p>
      </div>
    </div>
  );
}

function Chip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${
        accent ? "bg-poke/10 text-poke ring-poke/30" : "bg-white/5 text-white/70 ring-white/10"
      }`}
    >
      {children}
    </span>
  );
}

const BURST_COLORS = ["#ffcb05", "#ff5e8a", "#9b7bff", "#3be0ff", "#2dff9b"];

function Burst() {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 160 + Math.random() * 140;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          size: 4 + Math.random() * 8,
          color: BURST_COLORS[i % BURST_COLORS.length],
          delay: 0.35 + Math.random() * 0.15,
        };
      }),
    [],
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10" aria-hidden>
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: p.color, boxShadow: `0 0 12px ${p.color}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: [0, 1.4, 0.6] }}
          transition={{ duration: 1.3, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
