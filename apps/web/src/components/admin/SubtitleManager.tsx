"use client";

import { useState } from "react";
import { SUBTITLE_LANGS, type AdminSubtitles } from "@ott/shared";
import { api, putText } from "@/lib/api-client";
import { Field, FormError, errorText } from "./fields";

const LANG_NAMES: Record<string, string> = { en: "English", lus: "Mizo" };

/** Subtitle files of a packaged film: add or replace a language from an .srt/.vtt, or remove it. */
export function SubtitleManager({ titleId, initial }: { titleId: string; initial: AdminSubtitles | null }) {
  const [subs, setSubs] = useState<AdminSubtitles | null>(initial);
  const [lang, setLang] = useState<string>(SUBTITLE_LANGS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);

  const run = async (job: () => Promise<AdminSubtitles>) => {
    setBusy(true);
    setError(null);
    try {
      setSubs(await job());
      setFileKey((k) => k + 1);
    } catch (e) {
      setError(errorText(e, "Could not update subtitles"));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    run(async () => putText<AdminSubtitles>(`/admin/titles/${titleId}/subtitles/${lang}`, await file.text()));
  };
  const remove = (code: string) => {
    if (!confirm(`Remove the ${LANG_NAMES[code] ?? code} subtitles?`)) return;
    run(() => api<AdminSubtitles>(`/admin/titles/${titleId}/subtitles/${code}`, { method: "DELETE" }));
  };

  const have = new Set(subs?.languages.map((l) => l.lang));

  return (
    <section className="panel mt-6 grid gap-4 p-5 sm:p-6">
      <h2 className="headline text-[22px]">Subtitles</h2>
      {!subs ? (
        <p className="text-ink-3">Couldn’t read this film’s files. Try again in a moment.</p>
      ) : !subs.hasVideo ? (
        <p className="text-ink-3">
          No packaged video yet. Package the film with <code>publish-film</code> first, then add subtitles here.
        </p>
      ) : (
        <>
          {subs.languages.length === 0 ? (
            <p className="text-ink-3">No subtitles yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {subs.languages.map((l) => (
                <li key={l.lang} className="flex items-center justify-between gap-3 py-2">
                  <span>{l.name} <span className="lbl text-ink-3">{l.lang}</span></span>
                  <button type="button" className="text-sm text-[#ff8a93] disabled:opacity-40" disabled={busy} onClick={() => remove(l.lang)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Language" className="w-40">
              <select className="field h-10" value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
                {SUBTITLE_LANGS.map((code) => (
                  <option key={code} value={code}>{LANG_NAMES[code]}</option>
                ))}
              </select>
            </Field>
            <Field label={have.has(lang) ? "Replace file (.srt or .vtt)" : "Subtitle file (.srt or .vtt)"} className="min-w-60 flex-1">
              <input
                key={fileKey}
                type="file"
                accept=".srt,.vtt,text/vtt,application/x-subrip"
                className="field h-10 py-1.5"
                disabled={busy}
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </Field>
          </div>
          <p className="text-sm text-ink-3">Viewers get new subtitles within a minute.</p>
        </>
      )}
      <FormError error={error} />
    </section>
  );
}
