"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminTitle, Maturity, TitleInput } from "@ott/shared";
import { TICKET_TIERS, slugify } from "@ott/shared";
import { api } from "@/lib/api-client";
import { formatTimeInput, fromLocalInput, joinList, parseTime, splitList, toLocalInput, toPaise, toRupees } from "@/lib/admin-form";
import { formatInr, maturityLabel } from "@/lib/format";
import { Field, FormError, ImageField, Toggle, errorText } from "./fields";

const MATURITIES: Maturity[] = ["G", "PG", "PG13", "R", "NC17", "TVY", "TVPG", "TV14", "TVMA"];
type Status = "draft" | "published" | "scheduled";

function initialForm(t: AdminTitle | null) {
  return {
    type: t?.type ?? "MOVIE",
    name: t?.name ?? "",
    slug: t?.slug ?? "",
    year: String(t?.year ?? new Date().getFullYear()),
    maturity: t?.maturity ?? ("PG" as Maturity),
    language: t?.language ?? "Mizo",
    synopsis: t?.synopsis ?? "",
    posterUrl: t?.posterUrl ?? "",
    backdropUrl: t?.backdropUrl ?? "",
    genres: joinList(t?.genres ?? []),
    cast: joinList(t?.cast ?? []),
    directors: joinList(t?.directors ?? []),
    tags: joinList(t?.tags ?? []),
    altNames: joinList(t?.altNames ?? []),
    manifestUrl: t?.manifestUrl ?? "",
    trailerUrl: t?.trailerUrl ?? "",
    duration: formatTimeInput(t?.durationSec),
    introStart: formatTimeInput(t?.introStartSec),
    introEnd: formatTimeInput(t?.introEndSec),
    creditsStart: formatTimeInput(t?.creditsStartSec),
    price: toRupees(t?.pricePaise ?? 7900),
    rentalHours: String(t?.rentalHours ?? 48),
    status: (t?.published ? "published" : t?.publishAt ? "scheduled" : "draft") as Status,
    publishAt: toLocalInput(t?.publishAt),
    featured: t?.featured ?? false,
  };
}
type Form = ReturnType<typeof initialForm>;

/** Builds the API payload, or returns a message for the first thing that's wrong. */
function toPayload(f: Form): TitleInput | string {
  const times = { duration: parseTime(f.duration), introStart: parseTime(f.introStart), introEnd: parseTime(f.introEnd), creditsStart: parseTime(f.creditsStart) };
  if (Object.values(times).some((v) => Number.isNaN(v))) return "Times look like 1:32:10 or 92:10";
  const pricePaise = toPaise(f.price);
  if (pricePaise == null) return "Enter a ticket price";
  if (f.status === "scheduled" && !f.publishAt) return "Pick when it should go live";
  const movie = f.type === "MOVIE";
  return {
    type: f.type,
    name: f.name,
    slug: f.slug || slugify(f.name),
    year: Number(f.year),
    maturity: f.maturity,
    language: f.language,
    synopsis: f.synopsis,
    posterUrl: f.posterUrl,
    backdropUrl: f.backdropUrl,
    genres: splitList(f.genres),
    cast: splitList(f.cast),
    directors: splitList(f.directors),
    tags: splitList(f.tags),
    altNames: splitList(f.altNames),
    trailerUrl: f.trailerUrl || null,
    manifestUrl: movie ? f.manifestUrl || null : null,
    durationSec: movie ? times.duration : null,
    introStartSec: movie ? times.introStart : null,
    introEndSec: movie ? times.introEnd : null,
    creditsStartSec: movie ? times.creditsStart : null,
    pricePaise,
    rentalHours: Number(f.rentalHours),
    published: f.status === "published",
    publishAt: f.status === "scheduled" ? fromLocalInput(f.publishAt) : null,
    featured: f.featured,
  };
}

export function TitleForm({ title, genres }: { title: AdminTitle | null; genres: string[] }) {
  const router = useRouter();
  const [f, setF] = useState(() => initialForm(title));
  const [slugEdited, setSlugEdited] = useState(!!title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = toPayload(f);
    if (typeof payload === "string") return setError(payload);
    setError(null);
    setSaving(true);
    try {
      if (title) {
        const updated = await api<AdminTitle>(`/admin/titles/${title.id}`, { method: "PATCH", body: payload });
        setF(initialForm(updated));
        setSavedAt(new Date());
        router.refresh();
      } else {
        const created = await api<AdminTitle>("/admin/titles", { body: payload });
        router.push(`/admin/titles/${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const currentGenres = splitList(f.genres);
  const addGenre = (g: string) => set("genres", joinList([...currentGenres, g]));
  const movie = f.type === "MOVIE";
  const pricePaise = toPaise(f.price);
  const noVideo = movie && !f.manifestUrl && f.status !== "draft";

  return (
    <form onSubmit={save} className="mb-6 grid gap-6">
      <section className="panel grid gap-5 p-5 sm:p-6">
        <h2 className="headline text-[22px]">Basics</h2>
        {!title && (
          <div className="seg w-fit" role="group" aria-label="Type">
            {(["MOVIE", "SERIES"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={f.type === t} onClick={() => set("type", t)}>
                {t === "MOVIE" ? "Film" : "Series"}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className="field"
              required
              value={f.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugEdited) set("slug", slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Web address" hint={`Page: /title/${f.slug || "…"}`}>
            <input
              className="field"
              required
              value={f.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set("slug", e.target.value);
              }}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Year">
            <input className="field" type="number" min={1900} max={2100} required value={f.year} onChange={(e) => set("year", e.target.value)} />
          </Field>
          <Field label="Rating">
            <select className="field" value={f.maturity} onChange={(e) => set("maturity", e.target.value as Maturity)}>
              {MATURITIES.map((m) => <option key={m} value={m}>{maturityLabel(m)}</option>)}
            </select>
          </Field>
          <Field label="Language">
            <input className="field" required value={f.language} onChange={(e) => set("language", e.target.value)} />
          </Field>
        </div>
        <Field label="Synopsis">
          <textarea className="field" rows={4} required value={f.synopsis} onChange={(e) => set("synopsis", e.target.value)} />
        </Field>
      </section>

      <section className="panel grid gap-5 p-5 sm:p-6">
        <h2 className="headline text-[22px]">Artwork</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <ImageField label="Poster" kind="poster" value={f.posterUrl} onChange={(v) => set("posterUrl", v)} hint="Portrait, 2:3 — e.g. 1000 × 1500" />
          <ImageField label="Backdrop" kind="backdrop" value={f.backdropUrl} onChange={(v) => set("backdropUrl", v)} hint="Wide, 16:9 — e.g. 1920 × 1080" />
        </div>
      </section>

      <section className="panel grid gap-5 p-5 sm:p-6">
        <h2 className="headline text-[22px]">People & discovery</h2>
        <Field
          label="Genres"
          hint={
            <span className="flex flex-wrap gap-1.5 pt-1">
              {genres.filter((g) => !currentGenres.includes(g)).map((g) => (
                <button key={g} type="button" className="chip h-6 hover:text-ink" onClick={() => addGenre(g)}>+ {g}</button>
              ))}
            </span>
          }
        >
          <input className="field" placeholder="Drama, Family" value={f.genres} onChange={(e) => set("genres", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cast" hint="Separate names with commas">
            <input className="field" value={f.cast} onChange={(e) => set("cast", e.target.value)} />
          </Field>
          <Field label="Directors">
            <input className="field" value={f.directors} onChange={(e) => set("directors", e.target.value)} />
          </Field>
          <Field label="Tags" hint="e.g. church, based on a true story">
            <input className="field" value={f.tags} onChange={(e) => set("tags", e.target.value)} />
          </Field>
          <Field label="Other spellings" hint="Mizo and English titles people might search for">
            <input className="field" value={f.altNames} onChange={(e) => set("altNames", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="panel grid gap-5 p-5 sm:p-6">
        <h2 className="headline text-[22px]">Video</h2>
        {movie ? (
          <>
            <Field label="Film stream (HLS master.m3u8)" hint="Filled in for you by publish-film; paste one here to use another host">
              <input className="field" type="url" value={f.manifestUrl} onChange={(e) => set("manifestUrl", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Field label="Running time" hint="h:mm:ss">
                <input className="field" placeholder="1:52:00" value={f.duration} onChange={(e) => set("duration", e.target.value)} />
              </Field>
              <Field label="Intro starts">
                <input className="field" placeholder="0:00" value={f.introStart} onChange={(e) => set("introStart", e.target.value)} />
              </Field>
              <Field label="Intro ends" hint="Shows “Skip intro”">
                <input className="field" placeholder="1:30" value={f.introEnd} onChange={(e) => set("introEnd", e.target.value)} />
              </Field>
              <Field label="Credits start">
                <input className="field" placeholder="1:48:20" value={f.creditsStart} onChange={(e) => set("creditsStart", e.target.value)} />
              </Field>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-2">{title ? "Episodes are managed below." : "Save the series first, then add seasons and episodes."}</p>
        )}
        <Field label="Trailer (HLS or MP4, free to watch)">
          <input className="field" type="url" value={f.trailerUrl} onChange={(e) => set("trailerUrl", e.target.value)} />
        </Field>
      </section>

      <section className="panel grid gap-5 p-5 sm:p-6">
        <h2 className="headline text-[22px]">Tickets</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ticket price (₹)" hint={pricePaise != null ? `Watch Together: ${formatInr(pricePaise + TICKET_TIERS.TOGETHER.addPaise)}` : undefined}>
            <input className="field" inputMode="decimal" required value={f.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Hours to finish watching" hint="Counted from the first press of Play">
            <input className="field" type="number" min={1} max={720} required value={f.rentalHours} onChange={(e) => set("rentalHours", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="panel grid gap-5 p-5 sm:p-6">
        <h2 className="headline text-[22px]">Publishing</h2>
        <div className="seg w-fit" role="group" aria-label="Status">
          {(["draft", "scheduled", "published"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={f.status === s} onClick={() => set("status", s)}>
              {s === "draft" ? "Draft" : s === "scheduled" ? "Scheduled" : "Published"}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-2">
          {f.status === "draft" && "Only staff can see it."}
          {f.status === "scheduled" && "Goes live by itself at the time below (Aizawl time)."}
          {f.status === "published" && "Visible to everyone and on sale."}
        </p>
        {f.status === "scheduled" && (
          <Field label="Go live at" className="max-w-xs">
            <input className="field" type="datetime-local" required value={f.publishAt} onChange={(e) => set("publishAt", e.target.value)} />
          </Field>
        )}
        <Toggle checked={f.featured} onChange={(v) => set("featured", v)} label="Feature on the home page" />
        {noVideo && <p className="text-sm text-gold">No film stream yet — people could buy tickets for something that won’t play.</p>}
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-4 rounded-[14px] bg-s1/90 p-3 shadow-[0_0_0_1px_var(--line-2),0_20px_40px_-20px_#000] backdrop-blur">
        <button className="btn btn-sm btn-red" disabled={saving}>{saving ? "Saving…" : title ? "Save changes" : movie ? "Create film" : "Create series"}</button>
        {savedAt && <span className="text-sm text-ink-2">Saved</span>}
        <FormError error={error} />
      </div>
    </form>
  );
}
