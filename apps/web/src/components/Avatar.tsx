import type { Profile } from "@ott/shared";

// Flat tiles in the handoff's oklch(0.5 0.07 H) family. Old keys are kept so saved profiles still resolve.
const tile = (h: number) => `oklch(0.5 0.07 ${h})`;
export const AVATARS: Record<string, string> = {
  oxblood: tile(30),
  gold: tile(75),
  ivory: tile(220),
  forest: tile(150),
  dusk: tile(330),
  sea: tile(200),
};

export function Avatar({ profile, size = 40 }: { profile: Pick<Profile, "name" | "avatar" | "kids">; size?: number }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-[6px] font-serif font-medium text-ink"
      style={{ width: size, height: size, background: AVATARS[profile.avatar] ?? AVATARS.oxblood, fontSize: size * 0.5 }}
    >
      {profile.name.slice(0, 1).toUpperCase()}
      {profile.kids && (
        <span className="absolute -right-1 -bottom-1 bg-ink px-1 font-sans text-[9px] font-bold text-[#20272a]">KIDS</span>
      )}
    </span>
  );
}
