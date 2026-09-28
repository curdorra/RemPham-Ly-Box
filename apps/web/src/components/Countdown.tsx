"use client";

import { useEffect, useState } from "react";
import { useT } from "./LangProvider";

function parts(target: number) {
  let ms = Math.max(0, target - Date.now());
  const d = Math.floor(ms / 864e5);
  ms -= d * 864e5;
  const h = Math.floor(ms / 36e5);
  ms -= h * 36e5;
  const m = Math.floor(ms / 6e4);
  const s = Math.floor((ms - m * 6e4) / 1000);
  return { d, h, m, s };
}

export function Countdown({ to }: { to: string }) {
  const t = useT();
  const target = new Date(to).getTime();
  const [now, setNow] = useState<ReturnType<typeof parts> | null>(null);
  useEffect(() => {
    setNow(parts(target));
    const id = setInterval(() => setNow(parts(target)), 1000);
    return () => clearInterval(id);
  }, [target]);
  const p = now ?? { d: 0, h: 0, m: 0, s: 0 };
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: [string | number, string][] = [
    [p.d, t("days")],
    [pad(p.h), t("hrs")],
    [pad(p.m), t("mins")],
    [pad(p.s), t("secs")],
  ];
  return (
    <div className="flex gap-2.5" suppressHydrationWarning>
      {cells.map(([v, l]) => (
        <div key={l} className="flex-1 rounded-[10px] bg-[rgba(241,232,218,.04)] px-2 pt-3.5 pb-2.5 text-center shadow-[inset_0_0_0_1px_var(--line)]">
          <b className="block font-serif text-[clamp(34px,4vw,54px)] leading-none font-normal [font-variant-numeric:lining-nums_tabular-nums]">{now ? v : "–"}</b>
          <small className="lbl text-[11px] text-gold">{l}</small>
        </div>
      ))}
    </div>
  );
}
