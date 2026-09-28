"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";

export function AccountActions() {
  const router = useRouter();

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button onClick={signOut} className="rounded border border-white/20 px-4 py-2 hover:bg-white/10">
      Sign out
    </button>
  );
}

export function RedeemGift() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api("/tickets/redeem", { body: { code } });
      setCode("");
      setMessage("Gift added to your tickets.");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not redeem that code");
    }
  }

  return (
    <form onSubmit={redeem} className="flex flex-wrap items-center gap-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="RLB-XXXX-XXXX"
        className="rounded bg-white/10 px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-brand"
      />
      <button className="rounded bg-white/15 px-4 py-2 hover:bg-white/25" disabled={!code.trim()}>
        Redeem gift
      </button>
      {message && <span className="text-sm text-white/80">{message}</span>}
    </form>
  );
}
