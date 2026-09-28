import type { Maturity } from "@ott/shared";

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** ₹79, or ₹79.50 when there are paise. */
export function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
}

const MATURITY_LABEL: Record<Maturity, string> = {
  G: "G", PG: "PG", PG13: "PG-13", R: "R", NC17: "NC-17",
  TVY: "TV-Y", TVPG: "TV-PG", TV14: "TV-14", TVMA: "TV-MA",
};
export const maturityLabel = (m: Maturity) => MATURITY_LABEL[m];
