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
  // Which locked profile is asking for its PIN, and which one is having its PIN set or removed.
  const [asking, setAsking] = useState<Profile | null>(null);
  const [pinOf, setPinOf] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");

  const closePin = () => {
    setAsking(null);
    setPinOf(null);
    setPin("");
  };
  const choose = async (p: Profile, enteredPin?: string) => {
    if (p.locked && enteredPin === undefined) {
      setError(null);
      setAsking(p);
      return;
    }
    try {
      await api("/profiles/current", { method: "PUT", body: { profileId: p.id, pin: enteredPin } });
      router.push(next);
      router.refresh();
    } catch (e) {
      setPin("");
      setError(e instanceof ClientApiError ? e.message : "Could not switch profile");
    }
  };
  /** Sets a PIN on an open profile, or removes the one a locked profile has (the entered digits are the old PIN). */
  const savePin = async (p: Profile) => {
    setError(null);
    try {
      await api(`/profiles/${p.id}`, { method: "PATCH", body: p.locked ? { pin: null, currentPin: pin } : { pin } });
      closePin();
      router.refresh();
    } catch (e) {
      setPin("");
      setError(e instanceof ClientApiError ? e.message : "Could not change the PIN");
    }
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
      <h1 className="display text-[clamp(36px,4.4vw,52px)]">{t("whosWatching")}</h1>
      <div className="mt-12 flex flex-wrap justify-center gap-7">
        {profiles.map((p) => (
          <div key={p.id} className="group flex w-[150px] flex-col items-center gap-4">
            <button
              onClick={() => (editing ? undefined : choose(p))}
              className="relative rounded-[6px] outline-[3px] outline-offset-4 outline-transparent transition-[outline-color] duration-200 hover:outline-ink focus-visible:outline-ink"
            >
              <Avatar profile={p} size={150} />
              {p.locked && <span className="absolute right-2 bottom-2 bg-[rgba(31,38,41,.7)] px-1.5 py-0.5 text-[10px] font-semibold">PIN</span>}
            </button>
            <span className={`text-base font-medium transition-opacity group-hover:opacity-100 ${p.id === currentId ? "opacity-100" : "opacity-60"}`}>{p.name}</span>
            {editing && (
              <button onClick={() => { setError(null); setPin(""); setPinOf(p); }} className="text-xs text-gold hover:underline">
                {p.locked ? "Remove PIN" : "Set PIN"}
              </button>
            )}
            {editing && profiles.length > 1 && (
              <button onClick={() => remove(p.id)} className="text-xs text-[#f0a09a] hover:underline">Remove</button>
            )}
          </div>
        ))}
        {profiles.length < 5 && !adding && (
          <button onClick={() => setAdding(true)} className="flex w-[150px] flex-col items-center gap-4 text-ink/60 hover:text-ink">
            <span className="font-cond grid h-[150px] w-[150px] place-items-center rounded-[6px] border-[1.5px] border-dashed border-ink/45 text-[56px] font-light">+</span>
            <span className="text-base font-medium">{t("addProfile")}</span>
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
      {(asking || pinOf) && (
        <div className="panel mt-10 grid w-full max-w-xs gap-3 p-6 text-center">
          <p className="font-semibold">
            {asking ? `Enter the PIN for ${asking.name}` : pinOf!.locked ? `Enter ${pinOf!.name}'s PIN to remove it` : `Choose a 4-digit PIN for ${pinOf!.name}`}
          </p>
          <input
            className="field text-center tracking-[0.5em]"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            autoFocus
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && (asking ? choose(asking, pin) : savePin(pinOf!))}
          />
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm flex-1" onClick={closePin}>{t("close")}</button>
            <button className="btn btn-red btn-sm flex-1" disabled={pin.length !== 4} onClick={() => (asking ? choose(asking, pin) : savePin(pinOf!))}>OK</button>
          </div>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-[#f0a09a]">{error}</p>}
      <button onClick={() => setEditing((e) => !e)} className="btn btn-ghost mt-14">{editing ? "Done" : t("manageProfiles")}</button>
    </div>
  );
}
