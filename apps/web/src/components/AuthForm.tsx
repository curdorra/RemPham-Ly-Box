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

  const label = "block text-[10px] font-semibold tracking-[.16em] text-[#5a6468] uppercase";
  const tab = (on: boolean) => `font-cond border-b-2 pb-2 text-[15px] tracking-[.2em] uppercase ${on ? "border-[#1f2629]" : "border-transparent text-[#8a949c]"}`;
  return (
    <form onSubmit={onSubmit} className="paper-form w-full max-w-[420px] space-y-6 bg-paper p-8 text-[#1f2629] shadow-[0_30px_60px_rgba(0,0,0,.35)] sm:p-11">
      <div className="flex gap-7">
        <Link href="/login" className={tab(mode === "login")}>{t("signIn")}</Link>
        <Link href="/signup" className={tab(mode === "signup")}>{t("signUp")}</Link>
      </div>
      <h1 className="font-serif text-[30px] leading-tight font-medium">{mode === "login" ? "Welcome back" : "Make an account"}</h1>
      {mode === "signup" && (
        <label className={label}>Name<input name="name" required autoComplete="name" className="field mt-1" /></label>
      )}
      <label className={label}>Email<input name="email" type="email" required autoComplete="email" className="field mt-1" /></label>
      <label className={label}>
        Password
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="field mt-1"
        />
      </label>
      {error && <p className="text-[12px] text-[#b3362f]">{error}</p>}
      <button disabled={busy} className="btn w-full bg-[#1f2629] text-paper hover:bg-[#333d41]">
        {mode === "login" ? t("signIn") : "Create account"}
      </button>
    </form>
  );
}
