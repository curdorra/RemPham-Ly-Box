"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminEpisode, AdminTitle, EpisodeInput } from "@ott/shared";
import { api } from "@/lib/api-client";
import { formatTimeInput, parseTime } from "@/lib/admin-form";
import { formatDuration } from "@/lib/format";
import { Field, FormError, ImageField, errorText } from "./fields";

type Seasons = AdminTitle["seasons"];

/** Seasons and episodes of a series. Every change returns the whole title, which replaces local state. */
export function EpisodeManager({ title }: { title: AdminTitle }) {
  const router = useRouter();
  const [seasons, setSeasons] = useState<Seasons>(title.seasons);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (path: string, init: { method?: string; body?: unknown }) => {
    setError(null);
    try {
      const t = await api<AdminTitle>(path, init);
      setSeasons(t.seasons);
      router.refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };

  const nextSeason = Math.max(0, ...seasons.map((s) => s.number)) + 1;

  return (
    <section className="panel grid gap-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="headline text-[22px]">Seasons & episodes</h2>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => call(`/admin/titles/${title.id}/seasons`, { body: { number: nextSeason, name: `Season ${nextSeason}` } })}
        >
          + Add season {nextSeason}
        </button>
      </div>
      <FormError error={error} />
      {seasons.length === 0 && <p className="text-ink-3">No seasons yet.</p>}

      {seasons.map((s) => {
        const nextEp = Math.max(0, ...s.episodes.map((e) => e.number)) + 1;
        return (
          <div key={s.id} className="grid gap-3 border-t border-[var(--line)] pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="field h-10 max-w-60 font-semibold"
                defaultValue={s.name}
                aria-label="Season name"
                onBlur={(e) => e.target.value !== s.name && call(`/admin/seasons/${s.id}`, { method: "PATCH", body: { name: e.target.value } })}
              />
              <span className="lbl text-ink-3">Season {s.number} · {s.episodes.length} episodes</span>
              <button
                type="button"
                className="ml-auto text-sm text-[#ff8a93] disabled:opacity-40"
                disabled={s.episodes.length > 0}
                title={s.episodes.length ? "Delete its episodes first" : undefined}
                onClick={() => confirm(`Delete ${s.name}?`) && call(`/admin/seasons/${s.id}`, { method: "DELETE" })}
              >
                Delete season
              </button>
            </div>

            <ul className="divide-y divide-[var(--line)]">
              {s.episodes.map((e) =>
                editing === e.id ? (
                  <li key={e.id} className="py-3">
                    <EpisodeForm
                      episode={e}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => (await call(`/admin/episodes/${e.id}`, { method: "PATCH", body })) && setEditing(null)}
                      onDelete={() => confirm(`Delete “${e.name}”?`) && call(`/admin/episodes/${e.id}`, { method: "DELETE" })}
                    />
                  </li>
                ) : (
                  <li key={e.id} className="flex items-center gap-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.thumbnailUrl} alt="" className="aspect-video w-24 shrink-0 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.number}. {e.name}</p>
                      <p className="text-sm text-ink-3">{formatDuration(e.durationSec)}</p>
                    </div>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(e.id)}>Edit</button>
                  </li>
                ),
              )}
            </ul>

            {editing === `new-${s.id}` ? (
              <EpisodeForm
                number={nextEp}
                onCancel={() => setEditing(null)}
                onSave={async (body) => (await call(`/admin/seasons/${s.id}/episodes`, { body })) && setEditing(null)}
              />
            ) : (
              <button type="button" className="btn btn-sm btn-ghost w-fit" onClick={() => setEditing(`new-${s.id}`)}>+ Add episode {nextEp}</button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function EpisodeForm({
  episode,
  number,
  onSave,
  onCancel,
  onDelete,
}: {
  episode?: AdminEpisode;
  number?: number;
  onSave: (body: EpisodeInput) => Promise<unknown>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [f, setF] = useState({
    number: String(episode?.number ?? number ?? 1),
    name: episode?.name ?? "",
    synopsis: episode?.synopsis ?? "",
    duration: formatTimeInput(episode?.durationSec),
    thumbnailUrl: episode?.thumbnailUrl ?? "",
    manifestUrl: episode?.manifestUrl ?? "",
    introStart: formatTimeInput(episode?.introStartSec),
    introEnd: formatTimeInput(episode?.introEndSec),
    creditsStart: formatTimeInput(episode?.creditsStartSec),
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof f, value: string) => setF((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    const t = [f.duration, f.introStart, f.introEnd, f.creditsStart].map(parseTime);
    if (t.some((v) => Number.isNaN(v))) return setError("Times look like 24:30 or 1:02:00");
    if (!t[0]) return setError("Enter the running time");
    setError(null);
    void onSave({
      number: Number(f.number),
      name: f.name,
      synopsis: f.synopsis,
      durationSec: t[0],
      thumbnailUrl: f.thumbnailUrl,
      manifestUrl: f.manifestUrl,
      introStartSec: t[1],
      introEndSec: t[2],
      creditsStartSec: t[3],
    });
  };

  return (
    <div className="grid gap-4 rounded-[10px] bg-s2 p-4">
      <div className="grid grid-cols-[80px_1fr_120px] gap-3">
        <Field label="No.">
          <input className="field" type="number" min={1} value={f.number} onChange={(e) => set("number", e.target.value)} />
        </Field>
        <Field label="Name">
          <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Length">
          <input className="field" placeholder="24:30" value={f.duration} onChange={(e) => set("duration", e.target.value)} />
        </Field>
      </div>
      <Field label="Synopsis">
        <textarea className="field" rows={2} value={f.synopsis} onChange={(e) => set("synopsis", e.target.value)} />
      </Field>
      <Field label="Stream (HLS master.m3u8)">
        <input className="field" type="url" value={f.manifestUrl} onChange={(e) => set("manifestUrl", e.target.value)} />
      </Field>
      <ImageField label="Thumbnail" kind="still" value={f.thumbnailUrl} onChange={(v) => set("thumbnailUrl", v)} hint="16:9 still from the episode" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Intro starts">
          <input className="field" value={f.introStart} onChange={(e) => set("introStart", e.target.value)} />
        </Field>
        <Field label="Intro ends">
          <input className="field" value={f.introEnd} onChange={(e) => set("introEnd", e.target.value)} />
        </Field>
        <Field label="Credits start">
          <input className="field" value={f.creditsStart} onChange={(e) => set("creditsStart", e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm btn-red" onClick={submit}>{episode ? "Save episode" : "Add episode"}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="ml-auto text-sm text-[#ff8a93]" onClick={onDelete}>Delete episode</button>}
      </div>
      <FormError error={error} />
    </div>
  );
}
