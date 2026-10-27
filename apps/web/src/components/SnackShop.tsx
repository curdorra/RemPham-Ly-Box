"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Order, SnackItem } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { formatInr } from "@/lib/format";
import { payOrder } from "@/lib/pay";
import { useT } from "./LangProvider";

const ICON: Record<string, React.ReactNode> = {
  popcorn: <path d="M5 9h14l-2 12H7zM9 9l1 12M15 9l-1 12M6 9a2.5 2.5 0 0 1 2-4 2.5 2.5 0 0 1 4-1.5A2.5 2.5 0 0 1 16 5a2.5 2.5 0 0 1 2 4" />,
  bowl: <path d="M3 11h18a9 9 0 0 1-18 0zM9 3c-1 1.5 1 2.5 0 4M13 3c-1 1.5 1 2.5 0 4" />,
  cup: <path d="M6 8h12l-1.5 13h-9zM5 8h14M12 8l2-5h3" />,
};
const iconFor = (slug: string) => (slug.includes("popcorn") ? "popcorn" : slug.includes("drink") || slug.includes("thingpui") ? "cup" : "bowl");

export function SnackShop({ items }: { items: SnackItem[] }) {
  const t = useT();
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState<"ASAP" | "SCHEDULED">("ASAP");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const lines = items.filter((i) => qty[i.id]);
  const total = lines.reduce((s, i) => s + i.pricePaise * qty[i.id]!, 0);
  const bump = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + d)) }));

  async function order() {
    setBusy(true);
    setMsg(null);
    try {
      const o = await api<Order>("/orders", {
        body: {
          snacks: lines.map((i) => ({ itemId: i.id, qty: qty[i.id]! })),
          delivery: { address, phone, when, ...(when === "SCHEDULED" && { scheduledFor: new Date(at).toISOString() }) },
        },
      });
      await payOrder(o);
      setQty({});
      setMsg(t("orderPlaced"));
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) {
        router.push("/login?next=/snacks");
        return;
      }
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const ready = total > 0 && address.trim().length >= 5 && phone.trim().length >= 10 && (when === "ASAP" || !!at);
  return (
    <div className="mt-10 grid items-start gap-5 lg:grid-cols-[1fr_360px]">
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3">
        {items.map((i) => (
          <div key={i.id} className="panel flex min-h-[170px] flex-col gap-1 p-5 max-sm:p-4">
            <span className="mb-2.5 grid h-[42px] w-[42px] place-items-center rounded-[10px] bg-[var(--gold-soft)] text-gold">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">{ICON[iconFor(i.slug)]}</svg>
            </span>
            <b className="text-[17px] font-semibold">{i.name}</b>
            <small className="text-[13.5px] text-ink-3">{i.description}</small>
            <div className="mt-auto flex items-center justify-between pt-3">
              <span className="font-semibold">{formatInr(i.pricePaise)}</span>
              {qty[i.id] ? (
                <div className="flex items-center gap-0.5 rounded-full bg-white/5 p-[3px]">
                  <button className="h-[30px] w-[30px] rounded-full hover:bg-white/10" onClick={() => bump(i.id, -1)} aria-label="Fewer">−</button>
                  <output className="min-w-[22px] text-center text-sm font-semibold">{qty[i.id]}</output>
                  <button className="h-[30px] w-[30px] rounded-full hover:bg-white/10" onClick={() => bump(i.id, 1)} aria-label="More">+</button>
                </div>
              ) : (
                <button className="h-9 rounded-lg px-3.5 text-[13.5px] font-semibold shadow-[inset_0_0_0_1px_var(--line-2)] hover:bg-[var(--gold-soft)]" onClick={() => bump(i.id, 1)}>
                  {t("add")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <aside className="panel sticky top-24 p-6">
        <h4 className="headline text-[22px]">{t("yourOrder")}</h4>
        <ul className="mt-3 min-h-11 space-y-1.5 text-[14.5px] text-ink-2">
          {lines.length ? (
            lines.map((i) => (
              <li key={i.id} className="flex justify-between"><span>{qty[i.id]} × {i.name}</span><span>{formatInr(i.pricePaise * qty[i.id]!)}</span></li>
            ))
          ) : (
            <li className="text-ink-3">{t("nothingYet")}</li>
          )}
        </ul>
        <div className="mt-4 grid gap-2">
          <input className="field" placeholder={t("address")} value={address} onChange={(e) => setAddress(e.target.value)} />
          <input className="field" placeholder={t("phone")} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="seg w-full">
            <button className="flex-1" aria-pressed={when === "ASAP"} onClick={() => setWhen("ASAP")}>{t("deliverNow")}</button>
            <button className="flex-1" aria-pressed={when === "SCHEDULED"} onClick={() => setWhen("SCHEDULED")}>{t("deliverAt")}</button>
          </div>
          {when === "SCHEDULED" && <input type="datetime-local" className="field" value={at} onChange={(e) => setAt(e.target.value)} />}
        </div>
        <div className="mt-4 flex justify-between border-t border-[var(--line)] pt-4 text-lg font-semibold">
          <span>{t("total")}</span>
          <span>{formatInr(total)}</span>
        </div>
        <button className="btn btn-red mt-3.5 w-full" disabled={!ready || busy} onClick={order}>
          {busy ? t("processing") : `${t("placeOrder")} · ${formatInr(total)}`}
        </button>
        {msg && <p className="mt-3 text-center text-sm text-ink-2">{msg}</p>}
      </aside>
    </div>
  );
}
