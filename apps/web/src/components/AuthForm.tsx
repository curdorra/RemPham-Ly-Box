"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Me } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { useT } from "./LangProvider";

/** Only allow same-site relative redirects after auth. */
function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const me = await api<Me>(`/auth/${mode}`, { body: form });
      const next = safeNext(params.get("next"), "/");
      // Households: ask who's watching before going on.
      router.push(mode === "login" && me.profiles.length > 1 ? `/profiles?next=${encodeURIComponent(next)}` : next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const input = "field";
  return (
    <form onSubmit={onSubmit} className="panel w-full max-w-sm space-y-4 p-8 backdrop-blur">
      <div className="eyebrow">RemPham Ly Box</div>
      <h1 className="display text-[44px]">{mode === "login" ? t("signIn") : t("signUp")}</h1>
      {mode === "signup" && <input name="name" placeholder="Name" required autoComplete="name" className={input} />}
      <input name="email" type="email" placeholder="Email" required autoComplete="email" className={input} />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        minLength={mode === "signup" ? 8 : undefined}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        className={input}
      />
      {error && <p className="text-sm text-[#ff8a93]">{error}</p>}
      <button disabled={busy} className="btn btn-red w-full">
        {mode === "login" ? t("signIn") : t("signUp")}
      </button>
      <p className="text-sm text-ink-3">
        {mode === "login" ? (
          <>New here? <Link href="/signup" className="text-gold hover:underline">Create an account</Link></>
        ) : (
          <>Already a member? <Link href="/login" className="text-gold hover:underline">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
