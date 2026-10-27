"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminScreening, AdminTitleRow } from "@ott/shared";
import { api } from "@/lib/api-client";
import { fromLocalInput, toLocalInput, toPaise, toRupees } from "@/lib/admin-form";
import { formatInr, formatShowtime } from "@/lib/format";
import { Field, FormError, errorText } from "./fields";

const parseAisles = (text: string) => text.split(/[,\s]+/).filter(Boolean).map(Number);

function useSave() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (path: string, init: { method?: string; body?: unknown }) => {
    setError(null);
    setBusy(true);
    try {
      await api(path, init);
      router.refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, setError, busy };
}

export function ScreeningManager({ screenings, films }: { screenings: AdminScreening[]; films: AdminTitleRow[] }) {
  const upcoming = screenings.filter((s) => s.state !== "ENDED");
  const past = screenings.filter((s) => s.state === "ENDED").reverse();
  return (
    <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
      <NewScreening films={films} />
      <div className="grid content-start gap-8">
        <div className="grid gap-3">
          {upcoming.length === 0 && <p className="text-ink-3">No opening nights coming up.</p>}
          {upcoming.map((s) => <ScreeningRow key={s.id} s={s} />)}
        </div>
        {past.length > 0 && (
          <div className="grid gap-3">
            <h2 className="lbl text-ink-3">Last 30 days</h2>
            {past.map((s) => <ScreeningRow key={s.id} s={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function NewScreening({ films }: { films: AdminTitleRow[] }) {
  const { run, error, setError, busy } = useSave();
  const [titleId, setTitleId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [price, setPrice] = useState("");
  const [rows, setRows] = useState("10");
  const [seatsPerRow, setSeatsPerRow] = useState("14");
  const [aisles, setAisles] = useState("3, 11");
  const film = films.find((f) => f.id === titleId);

  const add = async () => {
    const aisleAfter = parseAisles(aisles);
    if (aisleAfter.some((n) => !Number.isInteger(n))) return setError("Aisles are seat numbers, e.g. 3, 11");
    const ok = await run("/admin/screenings", {
      body: {
        titleId,
        startsAt: fromLocalInput(startsAt),
        pricePaise: toPaise(price),
        rows: Number(rows),
        seatsPerRow: Number(seatsPerRow),
        aisleAfter,
      },
    });
    if (ok) setStartsAt("");
  };

  return (
    <div className="panel grid content-start gap-4 p-5">
      <h2 className="headline text-[20px]">New opening night</h2>
      <Field label="Film">
        <select className="field" value={titleId} onChange={(e) => setTitleId(e.target.value)}>
          <option value="">Choose a film…</option>
          {films.map((f) => <option key={f.id} value={f.id}>{f.name}{f.published ? "" : " (draft)"}</option>)}
        </select>
      </Field>
      <Field label="Starts (Aizawl time)">
        <input className="field" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </Field>
      <Field label="Ticket price (₹)" hint={film ? `Leave empty to use the film’s price, ${formatInr(film.pricePaise)}` : "Leave empty to use the film’s price"}>
        <input className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Rows">
          <input className="field" type="number" min={1} max={26} value={rows} onChange={(e) => setRows(e.target.value)} />
        </Field>
        <Field label="Seats / row">
          <input className="field" type="number" min={1} max={99} value={seatsPerRow} onChange={(e) => setSeatsPerRow(e.target.value)} />
        </Field>
        <Field label="Aisles after">
          <input className="field" value={aisles} onChange={(e) => setAisles(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-ink-3">{Number(rows) * Number(seatsPerRow) || 0} seats. While a film has an opening night coming up, tickets are only sold for that night.</p>
      {film && !film.published && <p className="text-sm text-gold">This film is a draft, so the night won’t show on the site until it’s published.</p>}
      <button className="btn btn-sm btn-red" disabled={busy || !titleId || !startsAt} onClick={add}>Add opening night</button>
      <FormError error={error} />
    </div>
  );
}

function ScreeningRow({ s }: { s: AdminScreening }) {
  const { run, error, busy } = useSave();
  const [editing, setEditing] = useState(false);
  const [startsAt, setStartsAt] = useState(toLocalInput(s.startsAt));
  const [price, setPrice] = useState(toRupees(s.pricePaise));
  const [rows, setRows] = useState(String(s.rows));
  const [seatsPerRow, setSeatsPerRow] = useState(String(s.seatsPerRow));
  const [aisles, setAisles] = useState(s.aisleAfter.join(", "));

  const save = async () => {
    const body = {
      startsAt: fromLocalInput(startsAt),
      pricePaise: toPaise(price),
      ...(!s.hasTickets && { rows: Number(rows), seatsPerRow: Number(seatsPerRow), aisleAfter: parseAisles(aisles) }),
    };
    if (await run(`/admin/screenings/${s.id}`, { method: "PATCH", body })) setEditing(false);
  };
  const remove = () => confirm(`Delete the opening night of ${s.title.name}?`) && run(`/admin/screenings/${s.id}`, { method: "DELETE" });

  const fill = s.capacity ? Math.round((s.seatsSold / s.capacity) * 100) : 0;
  return (
    <div className="panel grid gap-4 p-4">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.title.posterUrl} alt="" className="aspect-[2/3] w-12 shrink-0 rounded object-cover" />
        <div className="min-w-0 flex-1">
          <div className="lbl flex items-center gap-2 text-gold">
            {s.state === "LIVE" && <span className="live-dot" />}
            {s.state === "LIVE" ? "Live now" : formatShowtime(s.startsAt)}
          </div>
          <p className="truncate text-[17px] font-semibold">{s.title.name}</p>
          <p className="text-sm text-ink-3 [font-variant-numeric:lining-nums_tabular-nums]">
            {s.seatsSold}/{s.capacity} seats sold ({fill}%) · {formatInr(s.pricePaise ?? s.title.pricePaise)}
            {s.pricePaise == null && " (film price)"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {s.title.published && <Link href={`/opening/${s.id}`} className="btn btn-sm btn-ghost max-sm:hidden">View</Link>}
          {s.state === "UPCOMING" && !editing && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      </div>
      {editing && (
        <div className="grid gap-4 border-t border-[var(--line)] pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts (Aizawl time)" hint={s.seatsSold ? "Ticket holders aren’t told automatically yet — let them know." : undefined}>
              <input className="field" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Ticket price (₹)" hint="Empty = the film’s price. Only affects new sales.">
              <input className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
          <fieldset disabled={s.hasTickets} className="grid grid-cols-3 gap-3 disabled:opacity-50">
            <Field label="Rows">
              <input className="field" type="number" min={1} max={26} value={rows} onChange={(e) => setRows(e.target.value)} />
            </Field>
            <Field label="Seats / row">
              <input className="field" type="number" min={1} max={99} value={seatsPerRow} onChange={(e) => setSeatsPerRow(e.target.value)} />
            </Field>
            <Field label="Aisles after">
              <input className="field" value={aisles} onChange={(e) => setAisles(e.target.value)} />
            </Field>
          </fieldset>
          {s.hasTickets && <p className="-mt-2 text-xs text-ink-3">Seats are taken, so the seat map is locked.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-sm btn-red" disabled={busy} onClick={save}>Save</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button
              className="ml-auto text-sm text-[#ff8a93] disabled:opacity-40"
              disabled={s.hasTickets}
              title={s.hasTickets ? "Tickets are sold — move it to a new time instead" : undefined}
              onClick={remove}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <FormError error={error} />
    </div>
  );
}
