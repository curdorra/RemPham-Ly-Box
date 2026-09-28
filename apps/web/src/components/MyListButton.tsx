"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/api-client";
import { useT } from "./LangProvider";

export function MyListButton({ titleId, initial }: { titleId: string; initial: boolean }) {
  const t = useT();
  const [inList, setInList] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    try {
      await api(`/me/list/${titleId}`, { method: inList ? "DELETE" : "PUT" });
      setInList(!inList);
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 401) router.push("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={toggle} disabled={busy} className="btn btn-ghost" aria-pressed={inList}>
      {inList ? `✓ ${t("added")}` : `+ ${t("myList")}`}
    </button>
  );
}
