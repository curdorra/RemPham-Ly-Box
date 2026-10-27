import { CINEMA_TZ } from "./format";

/** "₹79.50" or "79.5" → 7950. Empty → null. */
export function toPaise(rupees: string): number | null {
  const n = Number(rupees.replace(/[₹,\s]/g, ""));
  return rupees.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
}
export const toRupees = (paise: number | null | undefined) => (paise == null ? "" : String(paise / 100));

/** "1:32:10", "92:10" or "5530" (seconds) → seconds. Empty → null; nonsense → NaN. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return NaN;
  return t.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}
export function formatTimeInput(sec: number | null | undefined) {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const splitList = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);
export const joinList = (list: string[]) => list.join(", ");

/** ISO → value for <input type="datetime-local">, in Aizawl time. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: CINEMA_TZ, hour12: false }).replace(" ", "T").slice(0, 16);
}
/** <input type="datetime-local"> value (Aizawl time) → ISO with offset. */
export const fromLocalInput = (value: string) => (value ? `${value}:00+05:30` : null);
