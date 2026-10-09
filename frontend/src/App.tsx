import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, usePoll } from "./api";
import { Background } from "./components/Background";
import { Collection, totalValue } from "./components/Collection";
import { CountUp } from "./components/CountUp";
import { Pokeball } from "./components/Pokeball";
import { ScanButton } from "./components/ScanButton";
import { ScanFeed } from "./components/ScanFeed";
import { Spotlight } from "./components/Spotlight";

type Tab = "live" | "collection";

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [pinned, setPinned] = useState<string | null>(null);
  const scans = usePoll(() => api.scans(24), 2000);
  const cards = usePoll(() => api.cards(200), 6000);

  const list = scans.data ?? [];
  const latestId = list[0]?.scan_id;
  // A new scan always takes over the spotlight.
  useEffect(() => setPinned(null), [latestId]);

  const spotlight = (pinned && list.find((s) => s.scan_id === pinned)) || list[0];
  const total = totalValue(cards.data ?? []);
  const offline = scans.error && !scans.data;

  return (
    <div className="relative min-h-dvh">
      <Background />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Pokeball className="size-10 drop-shadow-[0_0_14px_rgba(255,80,120,0.6)]" />
            <div>
              <h1 className="text-2xl font-bold leading-none tracking-tight">
                Poké<span className="text-holo">Reader</span>
              </h1>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                <span className={`size-1.5 rounded-full ${offline ? "bg-rose-500" : "animate-pulse bg-emerald-400"}`} />
                {offline ? "offline" : "live scanner"}
              </p>
            </div>
          </div>
          {total && (
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Collection</p>
              <p className="font-mono text-xl font-bold text-emerald-300">
                <CountUp value={total.value} currency={total.currency} />
              </p>
            </div>
          )}
        </header>

        <div className="mb-6 flex items-center justify-between gap-3">
          <nav className="glass inline-flex rounded-full p-1">
            {(["live", "collection"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative rounded-full px-5 py-2 text-sm font-semibold capitalize transition ${
                  tab === t ? "text-black" : "text-white/60 hover:text-white"
                }`}
              >
                {tab === t && (
                  <motion.span layoutId="tab" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
                )}
                <span className="relative">{t}</span>
              </button>
            ))}
          </nav>
          <ScanButton
            onUploaded={() => {
              setTab("live");
              scans.refresh();
            }}
          />
        </div>

        {offline && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-rose-500/10 p-4 text-rose-200 ring-1 ring-rose-400/20">
            <WifiOff className="size-5 shrink-0" />
            Can’t reach the API ({scans.error}). Is the backend running?
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.main
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-8"
          >
            {tab === "live" ? (
              <>
                <Spotlight scan={spotlight} loading={!scans.data && !scans.error} onChanged={scans.refresh} />
                <ScanFeed scans={list} activeId={spotlight?.scan_id} onSelect={setPinned} />
              </>
            ) : (
              <Collection cards={cards.data ?? []} />
            )}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
