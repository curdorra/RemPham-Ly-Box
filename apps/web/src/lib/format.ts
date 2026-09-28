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

export const CINEMA_TZ = "Asia/Kolkata";

/** "Fri 18 Dec · 7:00 PM" in Mizoram time. */
export function formatShowtime(iso: string, opts: { weekday?: boolean } = { weekday: true }) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-IN", { timeZone: CINEMA_TZ, ...(opts.weekday && { weekday: "short" }), day: "numeric", month: "short" });
  return `${date} · ${formatTime(iso)}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: CINEMA_TZ, hour: "numeric", minute: "2-digit" }).toUpperCase();
}

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
