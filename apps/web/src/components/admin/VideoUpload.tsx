"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminVideo, VideoUploadTarget } from "@ott/shared";
import { api } from "@/lib/api-client";
import { FormError, errorText } from "./fields";

const PARALLEL = 4;
const TRIES = 3;
const POLL_MS = 5000;

const size = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/** PUTs one part and returns its ETag. XHR rather than fetch, for upload progress. */
function sendPart(url: string, body: Blob, onLoaded: (bytes: number) => void, xhrs: Set<XMLHttpRequest>): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrs.add(xhr);
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      xhrs.delete(xhr);
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else if (xhr.status < 300) reject(new Error("Storage didn't return the part's ETag (bucket CORS needs setting up for uploads)"));
      else reject(new Error(`Part upload failed (${xhr.status})`));
    };
    xhr.onerror = () => {
      xhrs.delete(xhr);
      reject(new Error("Connection lost"));
    };
    xhr.onabort = () => {
      xhrs.delete(xhr);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    xhr.send(body);
  });
}

/**
 * Uploads a film's video file. The browser sends it in parts straight to
 * storage; then the film worker converts it, and this panel follows along.
 */
export function VideoUpload({ titleId, initial, hasStream }: { titleId: string; initial: AdminVideo | null; hasStream: boolean }) {
  const router = useRouter();
  const [video, setVideo] = useState<AdminVideo | null>(initial);
  const [sent, setSent] = useState<{ bytes: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const xhrs = useRef(new Set<XMLHttpRequest>());
  const cancelled = useRef(false);
  const uploading = sent !== null;
  const converting = video?.status === "QUEUED" || video?.status === "CONVERTING";

  // Follow the conversion; refresh the page once the new stream is attached.
  useEffect(() => {
    if (!converting) return;
    const timer = setInterval(async () => {
      try {
        const next = await api<AdminVideo | null>(`/admin/titles/${titleId}/video`);
        setVideo(next);
        if (next?.status === "READY") router.refresh();
      } catch {
        // Try again on the next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [converting, titleId, router]);

  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    cancelled.current = false;
    setSent({ bytes: 0, total: file.size });
    try {
      const target = await api<VideoUploadTarget>(`/admin/titles/${titleId}/video/uploads`, {
        body: { fileName: file.name, sizeBytes: file.size },
      });
      const loaded = new Map<number, number>();
      const report = () => setSent({ bytes: [...loaded.values()].reduce((a, b) => a + b, 0), total: file.size });
      const queue = [...target.parts];
      const done: { partNumber: number; etag: string }[] = [];

      const lane = async () => {
        for (let part = queue.shift(); part; part = queue.shift()) {
          const blob = file.slice((part.partNumber - 1) * target.partSize, part.partNumber * target.partSize);
          for (let attempt = 1; ; attempt++) {
            try {
              const etag = await sendPart(part.url, blob, (b) => (loaded.set(part!.partNumber, b), report()), xhrs.current);
              done.push({ partNumber: part.partNumber, etag });
              break;
            } catch (e) {
              loaded.set(part.partNumber, 0);
              if (cancelled.current || attempt >= TRIES) throw e;
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, target.parts.length) }, lane));
      setVideo(await api<AdminVideo>(`/admin/titles/${titleId}/video/complete`, { body: { parts: done } }));
    } catch (e) {
      for (const x of xhrs.current) x.abort();
      if (!cancelled.current) setError(e instanceof Error && !("status" in e) ? e.message : errorText(e, "Upload failed"));
    } finally {
      setSent(null);
      setFileKey((k) => k + 1);
    }
  };

  const cancel = async () => {
    cancelled.current = true;
    for (const x of xhrs.current) x.abort();
    try {
      await api(`/admin/titles/${titleId}/video/upload`, { method: "DELETE" });
      setVideo(null);
    } catch {
      // Nothing was started yet, or it's already gone.
    }
  };

  const retry = async () => {
    setError(null);
    try {
      setVideo(await api<AdminVideo>(`/admin/titles/${titleId}/video/retry`, { method: "POST" }));
    } catch (e) {
      setError(errorText(e, "Could not retry"));
    }
  };

  const pct = sent ? Math.floor((sent.bytes / Math.max(1, sent.total)) * 100) : video?.progress ?? 0;

  return (
    <section className="panel mt-6 grid gap-4 p-5 sm:p-6">
      <h2 className="headline text-[22px]">Film video</h2>

      {uploading ? (
        <Progress pct={pct} label={`Uploading… ${size(sent.bytes)} of ${size(sent.total)}`} hint="Keep this page open until the upload finishes." />
      ) : video?.status === "QUEUED" ? (
        <Progress pct={0} label={`Waiting to convert ${video.fileName}`} hint="You can leave this page; conversion carries on without it." />
      ) : video?.status === "CONVERTING" ? (
        <Progress pct={pct} label={`Converting ${video.fileName}… ${pct}%`} hint="A feature film takes an hour or more. You can leave this page." />
      ) : video?.status === "FAILED" ? (
        <div className="grid gap-2">
          <p className="text-[#ff8a93]">Converting {video.fileName} didn’t work.</p>
          {video.error && <p className="text-sm text-ink-3">{video.error}</p>}
          <button type="button" className="btn btn-sm w-fit" onClick={retry}>Try converting again</button>
        </div>
      ) : video?.status === "UPLOADING" ? (
        <p className="text-ink-3">An upload of {video.fileName} was interrupted. Choose the file again to start over.</p>
      ) : video?.status === "READY" ? (
        <p className="text-ink-2">Streaming from {video.fileName} ({size(video.sizeBytes)}).</p>
      ) : (
        <p className="text-ink-3">{hasStream ? "This film streams from a link set below." : "No video yet."}</p>
      )}

      {uploading ? (
        <button type="button" className="text-sm text-[#ff8a93] w-fit" onClick={cancel}>Cancel upload</button>
      ) : (
        !converting && (
          <label className="grid gap-1.5">
            <span className="lbl text-ink-3">
              {video?.status === "READY" || hasStream ? "Replace with a new file" : "Upload the film"} (MP4 or MOV)
            </span>
            <input key={fileKey} type="file" accept="video/*,.mp4,.mov,.mkv" className="field h-10 py-1.5" onChange={(e) => upload(e.target.files?.[0])} />
            {(video?.status === "READY" || hasStream) && (
              <span className="text-sm text-ink-3">The current video keeps playing until the new one is ready. Anyone watching at the moment it switches will need to reopen the film.</span>
            )}
          </label>
        )
      )}
      <FormError error={error} />
    </section>
  );
}

function Progress({ pct, label, hint }: { pct: number; label: string; hint: string }) {
  return (
    <div className="grid gap-2">
      <p>{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-gold transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-ink-3">{hint}</p>
    </div>
  );
}
