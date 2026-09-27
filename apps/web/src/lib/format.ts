import type { Maturity } from "@ott/shared";

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

const MATURITY_LABEL: Record<Maturity, string> = {
  G: "G", PG: "PG", PG13: "PG-13", R: "R", NC17: "NC-17",
  TVY: "TV-Y", TVPG: "TV-PG", TV14: "TV-14", TVMA: "TV-MA",
};
export const maturityLabel = (m: Maturity) => MATURITY_LABEL[m];
