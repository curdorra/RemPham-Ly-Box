"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";

export function AccountActions({ hasSubscription }: { hasSubscription: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function manageBilling() {
    setBusy(true);
    const { url } = await api<{ url: string }>("/billing/portal", { method: "POST" });
    window.location.assign(url);
  }

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-3">
      {hasSubscription && (
        <button onClick={manageBilling} disabled={busy} className="rounded bg-white/15 px-4 py-2 hover:bg-white/25 disabled:opacity-60">
          Manage billing
        </button>
      )}
      <button onClick={signOut} className="rounded border border-white/20 px-4 py-2 hover:bg-white/10">
        Sign out
      </button>
    </div>
  );
}
