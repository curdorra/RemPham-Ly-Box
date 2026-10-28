"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TICKET_TIERS } from "@ott/shared";
import type { Order, SnackItem, TicketTier, TitleSummary } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { formatInr, formatShowtime } from "@/lib/format";
import { payOrder } from "@/lib/pay";
import { ETicket } from "./ETicket";
import { useT } from "./LangProvider";

const COMBO = [
  ["butter-popcorn", 1],
  ["cold-drink", 2],
] as const;

export interface BookingProps {
  title: TitleSummary;
  /** Opening night: its id, start and the seats the viewer picked. */
  screening?: { id: string; startsAt: string; pricePaise: number; seats: string[] };
  open: boolean;
  onClose: () => void;
}

/** Slide-in checkout: ticket type, quantity, optional snack combo, UPI. */
export function BookingSheet({ title, screening, open, onClose }: BookingProps) {
  const t = useT();
  const router = useRouter();
  const [tier, setTier] = useState<TicketTier>("STANDARD");
  const [qty, setQty] = useState(screening?.seats.length || 1);
  const [combo, setCombo] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [snacks, setSnacks] = useState<SnackItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Order | null>(null);

  useEffect(() => {
    if (open) api<SnackItem[]>("/snacks").then(setSnacks).catch(() => setSnacks([]));
  }, [open]);
  useEffect(() => {
    if (screening) setQty(Math.max(1, screening.seats.length));
  }, [screening]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const base = screening?.pricePaise ?? title.pricePaise;
  const comboItems = COMBO.map(([slug, n]) => ({ item: snacks.find((s) => s.slug === slug), n })).filter((c) => c.item);
  const comboPaise = comboItems.reduce((sum, c) => sum + c.item!.pricePaise * c.n, 0);
  const total = (base + TICKET_TIERS[tier].addPaise) * qty + (combo ? comboPaise : 0);
  const hours = title.rentalHours + TICKET_TIERS[tier].extraHours;

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const order = await api<Order>("/orders", {
        body: {
          titleId: title.id,
          tier,
          quantity: qty,
          ...(screening && { screeningId: screening.id, seats: screening.seats.length ? screening.seats : undefined }),
          ...(combo && {
            snacks: comboItems.map((c) => ({ itemId: c.item!.id, qty: c.n })),
            delivery: screening
              ? { address, phone, when: "SCHEDULED", scheduledFor: new Date(new Date(screening.startsAt).getTime() - 15 * 60_000).toISOString() }
              : { address, phone, when: "ASAP" },
          }),
        },
      });
      setDone(await payOrder(order));
      router.refresh();
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) {
        router.push(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    onClose();
    setTimeout(() => setDone(null), 400);
  };
  const labels = {
    seat: t("seat"), where: t("where"), atHome: t("atHome"), validFor: t("validFor"), screens: t("screens"), paidL: t("paidL"), booking: t("booking"),
    anyTime: t("anyTime"), showAtCinema: t("showAtCinema"), hoursToFinish: t("hoursToFinish"), standard: t("standard"), together: t("together"),
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={close}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title.name}
        className={`fixed right-0 bottom-0 z-[61] flex w-full flex-col overflow-y-auto bg-[linear-gradient(to_bottom,#1c0a0c,var(--color-s1)_40%)] shadow-[-1px_0_0_var(--line-2)] transition-transform duration-500 ease-[cubic-bezier(.2,.7,.1,1)] max-sm:max-h-[92svh] max-sm:rounded-t-[22px] sm:top-0 sm:w-[480px] ${
          open ? "translate-x-0 translate-y-0" : "max-sm:translate-y-full sm:translate-x-full"
        }`}
      >
        <div className="relative aspect-[16/8] shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={title.backdropUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,#1c0a0c,rgba(28,10,12,.2)_60%)]" />
          <button onClick={close} aria-label={t("close")} className="absolute top-3.5 right-3.5 grid h-[38px] w-[38px] place-items-center rounded-full bg-black/60 backdrop-blur">✕</button>
          <div className="absolute right-[22px] bottom-3.5 left-[22px]">
            <div className="lbl text-[11px] text-gold">{screening ? `${t("openingNight")} · ${formatShowtime(screening.startsAt)}` : title.genres[0]?.name}</div>
            <h3 className="display text-[40px] leading-none">{title.name}</h3>
          </div>
        </div>

        {done ? (
          <div className="flex flex-col gap-3 px-[22px] pt-2 pb-7">
            <div className="lbl text-[#4ade80]">✓ {t("paid")}</div>
            <p className="text-[14.5px] text-ink-2">{t("paidSub")}</p>
            {done.tickets.filter((x) => !x.isGiftForOthers).map((x) => (
              <ETicket key={x.id} ticket={x} labels={labels} paidPaise={done.amountPaise} perfBg="#1c0a0c" />
            ))}
            {done.tickets.some((x) => x.isGiftForOthers) && (
              <p className="text-sm text-ink-2">{done.tickets.filter((x) => x.isGiftForOthers).length} × gift code — see {t("myTickets")}.</p>
            )}
            <div className="flex gap-2.5">
              <button className="btn btn-ghost flex-1" onClick={close}>{t("close")}</button>
              {!screening && <button className="btn btn-red flex-1" onClick={() => router.push(`/watch/${title.id}`)}>▶ {t("watch")}</button>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-[22px] pt-2 pb-7">
            {screening && screening.seats.length > 0 && (
              <div className="flex items-center justify-between rounded-[10px] bg-[var(--gold-soft)] px-4 py-3.5 text-[14.5px] shadow-[inset_0_0_0_1px_var(--line-2)]">
                <span>{t("yourSeat")}: <b>{screening.seats.join(", ")}</b></span>
                <button onClick={close} className="text-[13.5px] font-semibold text-gold">Change</button>
              </div>
            )}
            {(Object.keys(TICKET_TIERS) as TicketTier[]).map((id) => {
              // Watch together isn't sold yet: shown so people know it's coming.
              const soon = id === "TOGETHER";
              return (
              <button
                key={id}
                role="radio"
                aria-checked={tier === id}
                aria-disabled={soon}
                disabled={soon}
                onClick={() => setTier(id)}
                className={`grid w-full grid-cols-[1fr_auto] gap-3 rounded-[10px] p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  tier === id ? "bg-[rgba(243,244,242,.12)] shadow-[inset_0_0_0_1px_var(--color-gold)]" : "bg-[rgba(243,244,242,.04)] shadow-[inset_0_0_0_1px_var(--line)]"
                }`}
              >
                <span>
                  <b className="text-lg font-semibold">{id === "STANDARD" ? t("standard") : t("together")}</b>
                  {soon && <span className="chip ml-2 align-middle bg-[var(--gold-soft)] text-gold">{t("comingSoon")}</span>}
                  <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-3">
                    {id === "STANDARD" ? t("standardPerks") : `${TICKET_TIERS.TOGETHER.screens} ${t("togetherPerks")}`}
                    <br />
                    {title.rentalHours + TICKET_TIERS[id].extraHours} {t("hoursToFinish")}
                  </span>
                </span>
                <span className="display text-[26px] tabular-nums">{soon ? "" : formatInr(base + TICKET_TIERS[id].addPaise)}</span>
              </button>
              );
            })}

            {comboItems.length > 0 && (
              <div className="rounded-[10px] bg-[rgba(243,244,242,.04)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px]">
                    {t("combo")}
                    <small className="block text-[12.5px] text-ink-3">{t("comboSub")} · +{formatInr(comboPaise)}</small>
                  </span>
                  <button
                    role="switch"
                    aria-checked={combo}
                    aria-label={t("combo")}
                    onClick={() => setCombo((c) => !c)}
                    className={`relative h-7 w-[46px] shrink-0 rounded-full transition ${combo ? "bg-ox shadow-[inset_0_0_0_1px_var(--color-gold)]" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full bg-white transition-transform ${combo ? "translate-x-[18px]" : ""}`} />
                  </button>
                </div>
                {combo && (
                  <div className="mt-3 grid gap-2">
                    <input className="field" placeholder={t("address")} value={address} onChange={(e) => setAddress(e.target.value)} />
                    <input className="field" placeholder={t("phone")} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {!screening?.seats.length && (
              <div className="flex items-center justify-between rounded-[10px] bg-[rgba(243,244,242,.04)] py-3 pr-3 pl-4 shadow-[inset_0_0_0_1px_var(--line)]">
                <span className="text-[15px]">
                  {t("tickets")}
                  <small className="block text-[12.5px] text-ink-3">{t("extrasGift")}</small>
                </span>
                <div className="flex items-center gap-0.5 rounded-full bg-white/5 p-[3px]">
                  <button className="h-[30px] w-[30px] rounded-full hover:bg-white/10" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">−</button>
                  <output className="min-w-[22px] text-center text-sm font-semibold">{qty}</output>
                  <button className="h-[30px] w-[30px] rounded-full hover:bg-white/10" onClick={() => setQty((q) => Math.min(10, q + 1))} aria-label="More">+</button>
                </div>
              </div>
            )}

            <div className="flex justify-between px-1 pt-1.5 text-[19px] font-semibold">
              <span>{t("total")}</span>
              <span className="display text-[26px] tabular-nums">{formatInr(total)}</span>
            </div>
            <button
              className="btn btn-red h-14 w-full text-base"
              disabled={busy || (combo && (address.trim().length < 5 || phone.trim().length < 10))}
              onClick={checkout}
            >
              {busy ? t("processing") : `${t("pay")} ${formatInr(total)} ${t("withUpi")}`}
            </button>
            {error && <p className="text-center text-sm text-[#ff8a93]">{error}</p>}
            <p className="text-center text-[12.5px] text-ink-3">{hours} {t("hoursToFinish")}.</p>
          </div>
        )}
      </aside>
    </>
  );
}
