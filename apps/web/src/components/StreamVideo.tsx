"use client";

import Hls from "hls.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/** A muted, looping background video that plays HLS (.m3u8) or plain files. */
export const StreamVideo = forwardRef<HTMLVideoElement, { src: string; className?: string; muted?: boolean }>(function StreamVideo(
  { src, className, muted = true },
  ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => video.current!);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const play = () => void v.play().catch(() => undefined);
    if (src.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 10 });
      hls.loadSource(src);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      return () => hls.destroy();
    }
    v.src = src;
    play();
    return () => {
      v.removeAttribute("src");
      v.load();
    };
  }, [src]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  return <video ref={video} className={className} muted={muted} loop playsInline preload="metadata" />;
});
