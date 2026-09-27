"use client";

import Hls from "hls.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackInfo } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";

const PROGRESS_INTERVAL_MS = 10_000;

type State =
  | { kind: "loading" }
  | { kind: "ready"; info: PlaybackInfo }
  | { kind: "error"; code: string; message: string };

export function Player({ titleId, episodeId }: { titleId: string; episodeId?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Last known playhead; read on unmount, when the <video> may already be torn down.
  const positionRef = useRef<{ positionSec: number; durationSec: number } | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [ended, setEnded] = useState(false);
  const router = useRouter();

  // 1. Request a playback grant (entitlement check happens server-side).
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setEnded(false);
    positionRef.current = null;
    api<PlaybackInfo>("/playback", { body: { titleId, episodeId } })
      .then((info) => !cancelled && setState({ kind: "ready", info }))
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ClientApiError && e.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
          return;
        }
        setState({
          kind: "error",
          code: e instanceof ClientApiError ? e.code : "error",
          message: e instanceof Error ? e.message : "Playback failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [titleId, episodeId, router]);

  const info = state.kind === "ready" ? state.info : null;

  // 2. Attach the HLS stream (native HLS on Safari, hls.js elsewhere).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !info) return;

    const start = () => {
      if (info.resumeFromSec > 0) video.currentTime = info.resumeFromSec;
      void video.play().catch(() => undefined);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({ capLevelToPlayerSize: true });
      hls.loadSource(info.manifestUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, start);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setState({ kind: "error", code: "stream_error", message: "The stream could not be played." });
      });
      return () => hls.destroy();
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = info.manifestUrl;
      video.addEventListener("loadedmetadata", start, { once: true });
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    setState({ kind: "error", code: "unsupported", message: "This browser cannot play HLS video." });
  }, [info]);

  // 3. Report progress periodically, on pause, and when leaving the page.
  const reportProgress = useCallback(
    (useBeacon = false) => {
      const pos = positionRef.current;
      if (!info || !pos) return;
      const body = { titleId: info.title.id, episodeId: info.episode?.id ?? null, ...pos };
      if (useBeacon) {
        // keepalive lets the PUT complete while the page unloads.
        void fetch("/api/me/progress", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        });
      } else {
        void api("/me/progress", { method: "PUT", body }).catch(() => undefined);
      }
    },
    [info],
  );

  useEffect(() => {
    if (!info) return;
    const video = videoRef.current;
    const timer = setInterval(() => {
      if (video && !video.paused) reportProgress();
    }, PROGRESS_INTERVAL_MS);
    const onHide = () => reportProgress(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      reportProgress(true);
    };
  }, [info, reportProgress]);

  const heading = info
    ? info.episode
      ? `${info.title.name} · S${info.episode.seasonNumber}:E${info.episode.number} ${info.episode.name}`
      : info.title.name
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {info && (
        <video
          ref={videoRef}
          controls
          playsInline
          className="h-full w-full"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (Number.isFinite(v.duration) && v.duration >= 1) {
              positionRef.current = { positionSec: Math.floor(v.currentTime), durationSec: Math.floor(v.duration) };
            }
          }}
          onPause={() => reportProgress()}
          onEnded={() => {
            reportProgress();
            setEnded(true);
          }}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent p-4">
        <button onClick={() => router.back()} className="pointer-events-auto rounded bg-white/10 px-3 py-1.5 hover:bg-white/20">
          ← Back
        </button>
        <p className="truncate font-semibold">{heading}</p>
      </div>

      {state.kind === "loading" && <p className="text-muted">Loading…</p>}

      {state.kind === "error" && (
        <div className="max-w-md space-y-4 p-6 text-center">
          <p className="text-lg">{state.message}</p>
          {state.code === "subscription_required" && (
            <Link href="/plans" className="inline-block rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-hover">
              Choose a plan
            </Link>
          )}
        </div>
      )}

      {ended && info?.nextEpisodeId && (
        <Link
          href={`/watch/${titleId}?episode=${info.nextEpisodeId}`}
          replace
          className="absolute bottom-24 right-8 rounded bg-white px-5 py-2 font-semibold text-black hover:bg-white/80"
        >
          Next episode ▶
        </Link>
      )}
    </div>
  );
}
