"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CinemaSchedule, SnackOrder, TitleSummary } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { formatInr, formatShowtime } from "@/lib/format";

const NEXT: Partial<Record<SnackOrder["status"], SnackOrder["status"][]>> = {
  PLACED: ["ACCEPTED", "CANCELED"],
  ACCEPTED: ["OUT_FOR_DELIVERY", "CANCELED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

export function SnackQueue({ orders }: { orders: SnackOrder[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const move = async (id: string, status: string) => {
    try {
      await api(`/admin/snack-orders/${id}`, { method: "PATCH", body: { status } });
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Update failed");
    }
  };
  return (
    <div className="space-y-3">
      {orders.length === 0 && <p className="text-ink-3">No open orders.</p>}
      {orders.map((o) => (
        <div key={o.id} className="panel flex flex-wrap items-start justify-between gap-4 p-4">
          <div>
            <div className="lbl text-gold">{o.status.replaceAll("_", " ")} · {o.when === "SCHEDULED" && o.scheduledFor ? formatShowtime(o.scheduledFor) : "ASAP"}</div>
            <p className="mt-1 text-[17px] font-semibold">{o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</p>
            <p className="text-sm text-ink-2">{o.address} · <a href={`tel:${o.phone}`} className="text-gold">{o.phone}</a> · {formatInr(o.totalPaise)}</p>
            {o.note && <p className="text-sm text-ink-3">“{o.note}”</p>}
          </div>
          <div className="flex gap-2">
            {(NEXT[o.status] ?? []).map((s) => (
              <button key={s} onClick={() => move(o.id, s)} className={`btn btn-sm ${s === "CANCELED" ? "btn-ghost" : "btn-red"}`}>
                {s.replaceAll("_", " ").toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-[#ff8a93]">{error}</p>}
    </div>
  );
}

export function ShowtimeEditor({ schedule, titles }: { schedule: CinemaSchedule; titles: TitleSummary[] }) {
  const router = useRouter();
  const [filmName, setFilmName] = useState("");
  const [titleId, setTitleId] = useState("");
  const [language, setLanguage] = useState("Mizo");
  const [date, setDate] = useState(schedule.days[1]?.date ?? "");
  const [times, setTimes] = useState("12:30, 15:30, 18:30");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const list = times.split(/[,\s]+/).filter(Boolean);
    if (!list.every((x) => /^\d{1,2}:\d{2}$/.test(x))) return setError("Times look like 12:30, 18:00");
    try {
      await api("/admin/showtimes", {
        body: list.map((hm) => ({
          cinemaSlug: schedule.cinema.slug,
          filmName: filmName || titles.find((x) => x.id === titleId)?.name,
          ...(titleId && { titleId }),
          language,
          // Entered in cinema local time (IST).
          startsAt: `${date}T${hm.padStart(5, "0")}:00+05:30`,
        })),
      });
      setFilmName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not save");
    }
  };
  const remove = async (id: string) => {
    await api(`/admin/showtimes/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="panel grid content-start gap-3 p-5">
        <select className="field" value={titleId} onChange={(e) => setTitleId(e.target.value)}>
          <option value="">— Film not on RemPham Ly Box —</option>
          {titles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input className="field" placeholder="Film name (as on the poster)" value={filmName} onChange={(e) => setFilmName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="field" placeholder="Language" value={language} onChange={(e) => setLanguage(e.target.value)} />
        </div>
        <input className="field" placeholder="Times, e.g. 12:30, 18:00" value={times} onChange={(e) => setTimes(e.target.value)} />
        <button className="btn btn-red" disabled={!date || (!filmName && !titleId)} onClick={add}>Add showtimes</button>
        {error && <p className="text-sm text-[#ff8a93]">{error}</p>}
        <p className="text-xs text-ink-3">Times are Aizawl time. Each day links to its BookMyShow page automatically.</p>
      </div>
      <div className="space-y-4">
        {schedule.days.map((d) => (
          <div key={d.date}>
            <div className="lbl text-gold">{d.date}</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.showtimes.length === 0 && <li className="text-sm text-ink-3">—</li>}
              {d.showtimes.map((s) => (
                <li key={s.id} className="chip gap-2">
                  {s.filmName} · {new Date(s.startsAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}
                  <button onClick={() => remove(s.id)} aria-label="Remove" className="text-[#ff8a93]">✕</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
