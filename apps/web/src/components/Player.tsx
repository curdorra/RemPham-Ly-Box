"use client";

import Hls from "hls.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackInfo } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { getDeviceId } from "@/lib/device";
import { useT } from "./LangProvider";

const PROGRESS_INTERVAL_MS = 10_000;
/** Keeps this device's screen claimed; the API frees screens silent for ~90s. */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** During a live opening night, drift beyond this is snapped back. */
const LIVE_DRIFT_SEC = 5;
/** How long the "lights are going down" card stays before the film fades in. */
const LIGHTS_MS = 2600;

type State =
  | { kind: "loading" }
  | { kind: "ready"; info: PlaybackInfo }
  | { kind: "error"; code: string; message: string; details?: { startsAt?: string } };

export function Player({ titleId, episodeId }: { titleId: string; episodeId?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Last known playhead; read on unmount, when the <video> may already be torn down.
  const positionRef = useRef<{ positionSec: number; durationSec: number } | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [ended, setEnded] = useState(false);
  const [lights, setLights] = useState(true);
  const [now, setNow] = useState(0);
  const router = useRouter();
  const t = useT();

  const lightsRef = useRef(true);
  useEffect(() => {
    const id = setTimeout(() => {
      lightsRef.current = false;
      setLights(false);
      const v = videoRef.current;
      if (v && v.readyState > 0 && v.paused) void v.play().catch(() => undefined);
    }, LIGHTS_MS);
    return () => clearTimeout(id);
  }, []);
  const deviceId = useRef<string>("");
  // When the live grant was received, to compute where the live playhead is now.
  const grantedAt = useRef(0);

  // 1. Request a playback grant (entitlement check happens server-side).
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setEnded(false);
    positionRef.current = null;
    deviceId.current ||= getDeviceId();
    api<PlaybackInfo>("/playback", { body: { titleId, episodeId, deviceId: deviceId.current } })
      .then((info) => {
        if (cancelled) return;
        grantedAt.current = performance.now();
        setState({ kind: "ready", info });
      })
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
          details: e instanceof ClientApiError ? (e.details as { startsAt?: string } | undefined) : undefined,
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
      // Live screenings: join where the hall is now (the lights card took a moment).
      const at = info.live ? info.live.offsetSec + (performance.now() - grantedAt.current) / 1000 : info.resumeFromSec;
      if (at > 0) video.currentTime = at;
      if (!lightsRef.current) void video.play().catch(() => undefined);
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

  // Where everyone else in the hall is right now.
  const livePosition = useCallback(
    () => (info?.live ? info.live.offsetSec + (performance.now() - grantedAt.current) / 1000 : 0),
    [info],
  );

  // Keep the screen claimed while playing; give it back on close.
  useEffect(() => {
    if (!info) return;
    const body = { ticketId: info.ticket.id, deviceId: deviceId.current };
    const timer = setInterval(() => {
      api("/playback/heartbeat", { body }).catch((e) => {
        if (e instanceof ClientApiError && (e.code === "too_many_screens" || e.code === "ticket_required")) {
          videoRef.current?.pause();
          setState({ kind: "error", code: e.code, message: e.message });
        }
      });
    }, HEARTBEAT_INTERVAL_MS);
    const release = () =>
      void fetch("/api/playback/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      release();
    };
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
            setNow(v.currentTime);
            if (Number.isFinite(v.duration) && v.duration >= 1) {
              positionRef.current = { positionSec: Math.floor(v.currentTime), durationSec: Math.floor(v.duration) };
            }
          }}
          onPause={() => reportProgress()}
          onSeeking={(e) => {
            // Opening nights play in sync: no skipping ahead or back.
            if (!info.live) return;
            const target = livePosition();
            if (Math.abs(e.currentTarget.currentTime - target) > LIVE_DRIFT_SEC) e.currentTarget.currentTime = target;
          }}
          onEnded={() => {
            reportProgress();
            setEnded(true);
          }}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent p-4 sm:px-8">
        <button onClick={() => router.back()} className="btn btn-ghost btn-sm pointer-events-auto">
          ← {t("back")}
        </button>
        <p className="truncate font-serif text-2xl italic">{heading}</p>
        {info?.live && <span className="chip chip-ox ml-auto"><span className="live-dot" />{t("liveNow")}</span>}
      </div>

      {/* Skip intro / next episode */}
      {info && !info.live && info.markers.introEndSec !== null && now >= (info.markers.introStartSec ?? 0) && now < info.markers.introEndSec && (
        <button
          onClick={() => {
            if (videoRef.current && info.markers.introEndSec !== null) videoRef.current.currentTime = info.markers.introEndSec;
          }}
          className="btn btn-ghost absolute right-8 bottom-28 z-10"
        >
          {t("skipIntro")} ⏭
        </button>
      )}
      {info?.nextEpisodeId && info.markers.creditsStartSec !== null && now >= info.markers.creditsStartSec && !ended && (
        <Link href={`/watch/${titleId}?episode=${info.nextEpisodeId}`} replace className="btn btn-ivory absolute right-8 bottom-28 z-10">
          {t("nextEpisode")} ▶
        </Link>
      )}

      {/* The lights go down */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black text-center transition-opacity duration-[1200ms] ${
          lights || state.kind === "loading" ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      >
        <div>
          <div className="lbl text-gold">{t("enjoy")}</div>
          <p className="mt-3 font-serif text-[clamp(36px,6vw,72px)] font-light text-ink-2 italic">{t("lightsDown")}</p>
          <div className="mx-auto mt-5 h-0.5 w-40 overflow-hidden bg-white/10">
            <i className="block h-full w-0 bg-gold" style={{ animation: `fill ${LIGHTS_MS}ms linear forwards` }} />
          </div>
        </div>
      </div>

      {state.kind === "error" && (
        <div className="relative z-30 max-w-md space-y-4 p-6 text-center">
          <p className="font-serif text-3xl italic">{state.message}</p>
          {state.code === "premiere_not_started" && state.details?.startsAt && (
            <p className="text-ink-2">Doors open at {new Date(state.details.startsAt).toLocaleString()}.</p>
          )}
          {state.code === "ticket_required" && (
            <button onClick={() => router.back()} className="btn btn-red">
              {t("book")}
            </button>
          )}
        </div>
      )}

      {ended && info?.nextEpisodeId && (
        <Link
          href={`/watch/${titleId}?episode=${info.nextEpisodeId}`}
          replace
          className="btn btn-ivory absolute right-8 bottom-24"
        >
          {t("nextEpisode")} ▶
        </Link>
      )}
    </div>
  );
}
