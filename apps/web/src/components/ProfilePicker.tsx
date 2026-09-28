"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@ott/shared";
import { api, ClientApiError } from "@/lib/api-client";
import { AVATARS, Avatar } from "./Avatar";
import { useT } from "./LangProvider";

export function ProfilePicker({ profiles, currentId, next }: { profiles: Profile[]; currentId: string; next: string }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kids, setKids] = useState(false);
  const [avatar, setAvatar] = useState("gold");
  const [error, setError] = useState<string | null>(null);

  const choose = async (id: string) => {
    await api("/profiles/current", { method: "PUT", body: { profileId: id } });
    router.push(next);
    router.refresh();
  };
  const create = async () => {
    setError(null);
    try {
      await api("/profiles", { body: { name, kids, avatar } });
      setAdding(false);
      setName("");
      setKids(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not add profile");
    }
  };
  const remove = async (id: string) => {
    try {
      await api(`/profiles/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not remove profile");
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
      <h1 className="display text-[clamp(52px,7vw,96px)]">{t("whosWatching")}</h1>
      <div className="mt-12 flex flex-wrap justify-center gap-8">
        {profiles.map((p) => (
          <div key={p.id} className="group flex w-32 flex-col items-center gap-3">
            <button
              onClick={() => (editing ? undefined : choose(p.id))}
              className={`rounded-xl transition ${p.id === currentId ? "ring-2 ring-gold ring-offset-4 ring-offset-bg" : "opacity-80 group-hover:opacity-100"}`}
            >
              <Avatar profile={p} size={120} />
            </button>
            <span className="font-serif text-xl italic">{p.name}</span>
            {editing && profiles.length > 1 && (
              <button onClick={() => remove(p.id)} className="text-xs text-[#ff8a93] hover:underline">Remove</button>
            )}
          </div>
        ))}
        {profiles.length < 5 && !adding && (
          <button onClick={() => setAdding(true)} className="flex w-32 flex-col items-center gap-3 text-ink-3 hover:text-ink">
            <span className="grid h-[120px] w-[120px] place-items-center rounded-lg text-5xl font-light shadow-[inset_0_0_0_1px_var(--line-2)]">+</span>
            <span className="font-serif text-xl italic">{t("addProfile")}</span>
          </button>
        )}
      </div>

      {adding && (
        <div className="panel mt-10 grid w-full max-w-md gap-3 p-6 text-left">
          <input className="field" placeholder="Name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="flex flex-wrap gap-2">
            {Object.keys(AVATARS).map((a) => (
              <button key={a} onClick={() => setAvatar(a)} className={`rounded-lg ${avatar === a ? "ring-2 ring-gold" : ""}`} aria-label={a}>
                <Avatar profile={{ name: name || "?", avatar: a, kids: false }} size={40} />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} className="h-4 w-4 accent-[var(--color-gold)]" />
            {t("kids")} — only family-friendly titles
          </label>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => setAdding(false)}>{t("close")}</button>
            <button className="btn btn-red btn-sm flex-1" disabled={!name.trim()} onClick={create}>{t("addProfile")}</button>
          </div>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-[#ff8a93]">{error}</p>}
      <button onClick={() => setEditing((e) => !e)} className="btn btn-ghost btn-sm mt-12">{editing ? "Done" : t("manageProfiles")}</button>
    </div>
  );
}
