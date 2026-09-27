"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/api-client";

export function SubscribeButton({ planId, current }: { planId: string; current: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/billing/checkout", { body: { planId } });
      window.location.assign(url);
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) {
        router.push("/signup?next=/plans");
        return;
      }
      setError(e instanceof Error ? e.message : "Checkout failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={subscribe}
        disabled={busy || current}
        className="w-full rounded bg-brand py-2.5 font-semibold hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {current ? "Current plan" : busy ? "Redirecting…" : "Choose plan"}
      </button>
      {error && <p className="text-sm text-brand">{error}</p>}
    </div>
  );
}
