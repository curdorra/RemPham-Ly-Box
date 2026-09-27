"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/api-client";

/** Only allow same-site relative redirects after auth. */
function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
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
      await api(`/auth/${mode}`, { body: form });
      router.push(safeNext(params.get("next"), mode === "signup" ? "/plans" : "/"));
      router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-white/20 bg-black/40 px-4 py-3 outline-none focus:border-white/60";
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-black/70 p-8">
      <h1 className="text-3xl font-bold">{mode === "login" ? "Sign in" : "Create account"}</h1>
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
      {error && <p className="text-sm text-brand">{error}</p>}
      <button disabled={busy} className="w-full rounded bg-brand py-3 font-semibold hover:bg-brand-hover disabled:opacity-60">
        {mode === "login" ? "Sign in" : "Sign up"}
      </button>
      <p className="text-sm text-muted">
        {mode === "login" ? (
          <>New here? <Link href="/signup" className="text-white hover:underline">Create an account</Link></>
        ) : (
          <>Already a member? <Link href="/login" className="text-white hover:underline">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
