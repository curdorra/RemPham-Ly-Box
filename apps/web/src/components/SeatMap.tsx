"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ScreeningDetail } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { formatInr } from "@/lib/format";
import { BookingSheet } from "./BookingSheet";
import { useT } from "./LangProvider";

/** Pick seats for an opening night, then check out. */
export function SeatMap({ screening, signedIn }: { screening: ScreeningDetail; signedIn: boolean }) {
  const t = useT();
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [reminded, setReminded] = useState(screening.reminded);
  const taken = new Set(screening.takenSeats);
  const mine = new Set(screening.mySeats);
  const { rows, seatsPerRow, aisleAfter } = screening.layout;
  const owned = screening.mySeats.length > 0;

  const toggle = (seat: string) =>
    setPicked((p) => (p.includes(seat) ? p.filter((s) => s !== seat) : p.length >= 10 ? p : [...p, seat]));

  async function remind() {
    try {
      await api(`/screenings/${screening.id}/reminder`, { method: reminded ? "DELETE" : "PUT" });
      setReminded(!reminded);
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) router.push(`/login?next=/opening/${screening.id}`);
    }
  }

  // Columns: row label, seats with aisle gaps, row label.
  const cols = seatsPerRow + aisleAfter.length;
  return (
    <div className="panel flex flex-col p-7 max-sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="headline text-[22px]">{t("pickSeat")}</b>
        <span className="text-[13.5px] text-ink-3">
          {screening.capacity - screening.seatsTaken} / {screening.capacity} {t("seatsLeft")}
        </span>
      </div>
      <div className="mx-auto mt-6 h-6 w-[78%] rounded-t-[50%] border-t-[3px] border-gold shadow-[0_-12px_30px_-12px_rgba(243,244,242,.6)]" />
      <div className="lbl text-center text-[11px] tracking-[.3em] text-gold">{t("screen")}</div>
      <div className="mx-auto mt-5 grid w-full max-w-[620px] gap-[6px]">
        {rows.map((r) => (
          <div key={r} className="grid items-center gap-[4px] sm:gap-[5px]" style={{ gridTemplateColumns: `16px repeat(${cols}, 1fr) 16px` }}>
            <span className="text-center text-[10.5px] font-semibold text-ink-3">{r}</span>
            {Array.from({ length: seatsPerRow }, (_, i) => i + 1).flatMap((n) => {
              const id = `${r}${n}`;
              const cell = (
                <button
                  key={id}
                  className="seat"
                  disabled={(taken.has(id) && !mine.has(id)) || owned}
                  aria-pressed={picked.includes(id) || mine.has(id)}
                  aria-label={`Row ${r} seat ${n}`}
                  onClick={() => toggle(id)}
                />
              );
              return aisleAfter.includes(n) ? [cell, <span key={`${id}-aisle`} />] : [cell];
            })}
            <span className="text-center text-[10.5px] font-semibold text-ink-3">{r}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-4 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-[3px] bg-white/15" />{t("available")}</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]" />{t("taken")}</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-[3px] bg-gold" />{t("yourSeat")}</span>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3.5 border-t border-[var(--line)] pt-5">
        <div>
          <b className="text-lg font-semibold">
            {owned ? `${t("yourSeat")}: ${screening.mySeats.join(", ")}` : picked.length ? picked.join(", ") : t("tapSeat")}
          </b>
          <small className="block text-[13px] text-ink-3">{t("tapSeatSub")}</small>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={remind}>{reminded ? `✓ ${t("reminded")}` : t("remind")}</button>
          {owned ? (
            <button className="btn btn-ivory btn-sm" onClick={() => router.push("/account")}>{t("viewTicket")}</button>
          ) : (
            <button
              className="btn btn-red btn-sm"
              disabled={!picked.length}
              onClick={() => (signedIn ? setOpen(true) : router.push(`/login?next=/opening/${screening.id}`))}
            >
              {t("prebook")} · {formatInr(screening.pricePaise * Math.max(1, picked.length))}
            </button>
          )}
        </div>
      </div>
      <BookingSheet
        title={screening.title}
        screening={{ id: screening.id, startsAt: screening.startsAt, pricePaise: screening.pricePaise, seats: picked }}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
