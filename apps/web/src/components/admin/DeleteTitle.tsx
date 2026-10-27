"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { FormError, errorText } from "./fields";

export function DeleteTitle({ id, name, canDelete }: { id: string; name: string; canDelete: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!confirm(`Delete “${name}” for good? This can’t be undone.`)) return;
    try {
      await api(`/admin/titles/${id}`, { method: "DELETE" });
      router.push("/admin/titles");
      router.refresh();
    } catch (e) {
      setError(errorText(e, "Could not delete"));
    }
  };
  return (
    <section className="mt-10 grid gap-2 border-t border-[var(--line)] pt-6">
      <h2 className="headline text-[18px] text-ink-2">Delete</h2>
      {canDelete ? (
        <button type="button" className="btn btn-sm btn-ghost w-fit text-[#ff8a93]" onClick={remove}>Delete this title</button>
      ) : (
        <p className="text-sm text-ink-3">People have tickets for this title, so it can’t be deleted. Set it to Draft to take it off the site.</p>
      )}
      <FormError error={error} />
    </section>
  );
}
