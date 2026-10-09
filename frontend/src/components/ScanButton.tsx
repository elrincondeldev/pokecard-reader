import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../api";

const MAX_SIDE = 1600;

/** Downscale big phone photos so they stay well under the API's 5 MB limit. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode image"))), "image/jpeg", 0.9),
  );
}

export function ScanButton({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative">
      {error && (
        <p
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-2xl bg-rose-500/90 px-4 py-2 text-center text-sm font-medium shadow-lg"
          onClick={() => setError(null)}
        >
          {error}
        </p>
      )}
      <button
        disabled={busy}
        onClick={() => input.current?.click()}
        className="group relative isolate inline-flex items-center gap-2 rounded-full bg-white py-2.5 pl-4 pr-5 text-sm font-bold text-black shadow-[0_10px_40px_-5px_rgba(155,123,255,0.7)] transition hover:scale-105 active:scale-95 disabled:opacity-70"
      >
        <span className="absolute -inset-0.5 -z-10 rounded-full bg-gradient-to-r from-poke via-pink-500 to-cyan-400 opacity-70 blur-md transition group-hover:opacity-100" />
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        {busy ? "Uploading…" : "Scan"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            await api.upload(await shrink(file));
            onUploaded();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
