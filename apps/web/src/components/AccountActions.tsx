"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "./LangProvider";

export function RedeemGift() {
  const t = useT();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api("/tickets/redeem", { body: { code } });
      setCode("");
      setMessage("✓");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not redeem that code");
    }
  }

  return (
    <form onSubmit={redeem} className="flex flex-wrap items-center gap-3">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RLB-XXXX-XXXX" className="field max-w-xs uppercase" />
      <button className="btn btn-ghost btn-sm" disabled={!code.trim()}>{t("redeem")}</button>
      {message && <span className="text-sm text-ink-2">{message}</span>}
    </form>
  );
}

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="chip font-mono hover:text-ink"
    >
      {copied ? "Copied ✓" : code}
    </button>
  );
}
