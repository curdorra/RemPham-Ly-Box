import type { Profile } from "@ott/shared";

export const AVATARS: Record<string, string> = {
  oxblood: "linear-gradient(135deg,#901c29,#3a0a10)",
  gold: "linear-gradient(135deg,#d9b46a,#7a5b26)",
  ivory: "linear-gradient(135deg,#f1e8da,#b9a98f)",
  forest: "linear-gradient(135deg,#3f6b4f,#15291d)",
  dusk: "linear-gradient(135deg,#5b4a8a,#221a3d)",
  sea: "linear-gradient(135deg,#2f6f86,#0f2a36)",
};

export function Avatar({ profile, size = 40 }: { profile: Pick<Profile, "name" | "avatar" | "kids">; size?: number }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-lg font-display font-bold text-ink shadow-[inset_0_0_0_1px_rgba(241,232,218,.2)]"
      style={{ width: size, height: size, background: AVATARS[profile.avatar] ?? AVATARS.oxblood, fontSize: size * 0.48 }}
    >
      {profile.name.slice(0, 1).toUpperCase()}
      {profile.kids && (
        <span className="absolute -right-1 -bottom-1 rounded bg-gold px-1 font-sans text-[9px] font-bold text-bg">KIDS</span>
      )}
    </span>
  );
}
