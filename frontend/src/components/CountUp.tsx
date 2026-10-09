import { animate } from "motion/react";
import { useEffect, useRef } from "react";
import { formatMoney } from "../price";

export function CountUp({ value, currency, duration = 1.4 }: { value: number; currency: string | null; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);

  useEffect(() => {
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = formatMoney(v, currency);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, currency, duration]);

  return <span ref={ref}>{formatMoney(0, currency)}</span>;
}
