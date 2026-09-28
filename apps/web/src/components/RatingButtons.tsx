"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RatingValue } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { useT } from "./LangProvider";

const ICONS: Record<RatingValue, React.ReactNode> = {
  [-1]: <path d="M7 14V4M7 14l4 7c1.5 0 2.5-1 2.5-2.5V16h5a2 2 0 0 0 2-2.3l-1.2-7A2 2 0 0 0 17.3 5H7" />,
  1: <path d="M7 10v10M7 10l4-7c1.5 0 2.5 1 2.5 2.5V8h5a2 2 0 0 1 2 2.3l-1.2 7a2 2 0 0 1-2 1.7H7" />,
  2: (
    <>
      <path d="M5 11v9M5 11l3.5-6c1.3 0 2.2.9 2.2 2.2V9h4.3a1.8 1.8 0 0 1 1.8 2l-1 6a1.8 1.8 0 0 1-1.8 1.5H5" />
      <path d="M13 4l1.5-1.5M16 6.5l2-.5M16.5 3l.5-1.5" />
    </>
  ),
};

/** Thumbs down / up / love. Clicking the active one clears it. */
export function RatingButtons({ titleId, initial }: { titleId: string; initial: RatingValue | null }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<RatingValue | null>(initial);

  async function rate(v: RatingValue) {
    const next = value === v ? null : v;
    setValue(next);
    try {
      if (next === null) await api(`/me/ratings/${titleId}`, { method: "DELETE" });
      else await api(`/me/ratings/${titleId}`, { method: "PUT", body: { value: next } });
    } catch (e) {
      setValue(value);
      if (e instanceof ClientApiError && e.status === 401) router.push("/login");
    }
  }

  const labels: Record<RatingValue, string> = { [-1]: t("rateNo"), 1: t("rateYes"), 2: t("rateLove") };
  return (
    <div className="flex items-center gap-1 rounded-full p-1 shadow-[inset_0_0_0_1px_var(--line-2)]" role="group" aria-label="Rate">
      {([-1, 1, 2] as RatingValue[]).map((v) => (
        <button
          key={v}
          onClick={() => rate(v)}
          aria-pressed={value === v}
          title={labels[v]}
          aria-label={labels[v]}
          className={`grid h-11 w-11 place-items-center rounded-full transition ${value === v ? "bg-gold text-bg" : "hover:bg-[var(--gold-soft)]"}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[v]}
          </svg>
        </button>
      ))}
    </div>
  );
}
