"use client";

import { useRef, useState } from "react";
import { ClientApiError, uploadImage } from "@/lib/api-client";

/** A labelled form control with an optional hint underneath. */
export function Field({ label, hint, className = "", children }: { label: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid content-start gap-1.5 ${className}`}>
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--color-ox-hot)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function FormError({ error }: { error: string | null }) {
  return error ? <p role="alert" className="text-sm text-[#ff8a93]">{error}</p> : null;
}

/** Turns an API error into one readable line, including the first field problem. */
export function errorText(e: unknown, fallback = "Could not save") {
  if (!(e instanceof ClientApiError)) return fallback;
  const issue = Array.isArray(e.details) ? (e.details[0] as { path?: (string | number)[]; message?: string } | undefined) : undefined;
  return issue?.message ? `${issue.path?.join(".") ?? ""}: ${issue.message}`.replace(/^: /, "") : e.message;
}

const ASPECT = { poster: "aspect-[2/3] w-28", backdrop: "aspect-video w-48", still: "aspect-video w-36" } as const;

/** Paste an image URL or upload a file; shows a preview. */
export function ImageField({
  label,
  kind,
  value,
  onChange,
  hint,
}: {
  label: string;
  kind: "poster" | "backdrop" | "still";
  value: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadImage(file, kind));
    } catch (e) {
      setError(errorText(e, "Upload failed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex gap-4">
      <div className={`${ASPECT[kind]} shrink-0 overflow-hidden rounded-md bg-s2 shadow-[0_0_0_1px_var(--line)]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value && <img src={value} alt="" className="size-full object-cover" />}
      </div>
      <div className="grid min-w-0 flex-1 content-start gap-2">
        <Field label={label} hint={hint}>
          <input className="field" value={value} placeholder="https://… or upload" onChange={(e) => onChange(e.target.value)} />
        </Field>
        <div>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : "Upload image"}
          </button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        <FormError error={error} />
      </div>
    </div>
  );
}
