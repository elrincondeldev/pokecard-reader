import { useEffect, useRef } from "react";

interface Props {
  src: string;
  alt: string;
  /** Gently sway on its own when nobody is touching it (looks great on video). */
  idle?: boolean;
  glow?: string;
  className?: string;
}

const MAX_TILT = 14;

export function HoloCard({ src, alt, idle = false, glow, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const touching = useRef(false);

  const tilt = (px: number, py: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", `${px}%`);
    el.style.setProperty("--my", `${py}%`);
    el.style.setProperty("--ry", `${((px - 50) / 50) * MAX_TILT}deg`);
    el.style.setProperty("--rx", `${((50 - py) / 50) * MAX_TILT}deg`);
  };

  useEffect(() => {
    if (!idle || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      if (!touching.current) {
        const t = (now - start) / 1000;
        tilt(50 + Math.sin(t * 0.9) * 38, 50 + Math.sin(t * 0.6 + 1) * 28);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [idle]);

  return (
    <div className={`[perspective:1200px] ${className}`}>
      <div
        ref={ref}
        className="holo-card"
        style={glow ? ({ "--glow": glow } as React.CSSProperties) : undefined}
        onPointerMove={(e) => {
          touching.current = true;
          const r = e.currentTarget.getBoundingClientRect();
          tilt(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
        }}
        onPointerLeave={() => {
          touching.current = false;
          if (!idle) tilt(50, 50);
        }}
      >
        <img src={src} alt={alt} draggable={false} />
        <div className="holo-shine" />
        <div className="holo-glare" />
      </div>
    </div>
  );
}
