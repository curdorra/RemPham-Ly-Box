"use client";

import { useEffect, useState } from "react";

// Almost every page error in production is the API still waking up on Render's free plan
// (it can take about a minute). Retry quietly for a while before asking the viewer to.
// Each retry's server render already retries for ~13s (apiGet), so space these wider than that.
const AUTO_RETRIES = 6;
const RETRY_EVERY_MS = 15000;

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const [tries, setTries] = useState(0);
  const waiting = tries < AUTO_RETRIES;

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => {
      setTries((n) => n + 1);
      retry();
    }, RETRY_EVERY_MS);
    return () => clearTimeout(id);
  }, [tries, waiting, retry]);

  return (
    <div className="gutter flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <span className="lbl text-gold">{waiting ? "One moment" : "Still not ready"}</span>
      <h1 className="display text-[clamp(36px,4.6vw,56px)]">{waiting ? "Warming up the projector…" : "We couldn’t reach the cinema"}</h1>
      <p className="max-w-md text-ink-2">
        {waiting
          ? "The site was asleep and is starting up. This page will load by itself in a moment."
          : "The server is taking longer than usual. Please try again in a minute."}
      </p>
      <button
        type="button"
        className={`btn btn-sm mt-2 ${waiting ? "btn-ghost" : "btn-red"}`}
        onClick={() => {
          setTries(0);
          retry();
        }}
      >
        Try again
      </button>
    </div>
  );
}
