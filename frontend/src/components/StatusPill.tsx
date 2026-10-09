import type { ScanStatus } from "../api";

const STYLES: Record<ScanStatus, { label: string; dot: string; text: string }> = {
  pending: { label: "Queued", dot: "bg-amber-400", text: "text-amber-300" },
  processing: { label: "Scanning", dot: "bg-cyan-400", text: "text-cyan-300" },
  done: { label: "Identified", dot: "bg-emerald-400", text: "text-emerald-300" },
  failed: { label: "Failed", dot: "bg-rose-500", text: "text-rose-300" },
};

export function StatusPill({ status, className = "" }: { status: ScanStatus; className?: string }) {
  const s = STYLES[status];
  const live = status === "pending" || status === "processing";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur ${s.text} ${className}`}
    >
      <span className="relative flex size-1.5">
        {live && <span className={`absolute inset-0 animate-ping rounded-full ${s.dot}`} />}
        <span className={`relative size-1.5 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}
