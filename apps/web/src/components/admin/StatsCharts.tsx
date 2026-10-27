import type { AdminStats, StatsTitleWatching } from "@ott/shared";
import { formatDuration, formatInr } from "@/lib/format";

/* Staff charts. One series each, so one ink colour on the slate: marks use the ink tokens, text stays text. */

const NUM = "[font-variant-numeric:lining-nums_tabular-nums]";
const pct = (n: number) => `${Math.round(n * 100)}%`;
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-5">
      <div className="lbl text-ink-3">{label}</div>
      <div className={`display mt-2 text-[clamp(28px,3vw,40px)] ${NUM}`}>{value}</div>
      {hint && <div className="mt-1 text-sm text-ink-3">{hint}</div>}
    </div>
  );
}

/** Revenue per day: thin bars on a shared baseline, labelled at the peak and the ends. */
export function DayBars({ days }: { days: AdminStats["money"]["byDay"] }) {
  const W = 720, H = 160, PAD_B = 2, PAD_T = 4;
  const max = Math.max(1, ...days.map((d) => d.grossPaise));
  const slot = W / Math.max(1, days.length);
  const bw = Math.max(2, Math.min(28, slot - 2)); // 2px gap between bars
  const peak = days.findIndex((d) => d.grossPaise === max && max > 1);
  const x = (i: number) => i * slot + (slot - bw) / 2;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Ticket sales per day, peak ${formatInr(max)}`}>
        <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--line-2)" />
        {days.map((d, i) => {
          const h = (d.grossPaise / max) * (H - PAD_B - PAD_T);
          return (
            <g key={d.day}>
              <rect x={x(i)} y={H - PAD_B - h} width={bw} height={Math.max(h, d.grossPaise ? 2 : 0)} fill="var(--color-ink-2)">
                <title>{`${dayLabel(d.day)}: ${formatInr(d.grossPaise)} · ${d.tickets} tickets`}</title>
              </rect>
              {/* wide invisible target so hover isn't limited to the thin bar */}
              <rect x={i * slot} y={0} width={slot} height={H - PAD_B} fill="transparent">
                <title>{`${dayLabel(d.day)}: ${formatInr(d.grossPaise)} · ${d.tickets} tickets`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      {/* Labels are HTML, not SVG text, so they stay readable when the chart shrinks on a phone. */}
      <figcaption className={`mt-2 flex justify-between gap-3 text-[12px] text-ink-3 ${NUM}`}>
        <span>{days.length ? dayLabel(days[0]!.day) : ""}</span>
        {peak >= 0 && <span className="text-ink-2">Best day: <b className="text-ink">{formatInr(max)}</b> · {dayLabel(days[peak]!.day)}</span>}
        <span>{days.length ? dayLabel(days[days.length - 1]!.day) : ""}</span>
      </figcaption>
    </figure>
  );
}

/** Horizontal bars with the value as text beside each row. */
export function BarRows({ rows }: { rows: { key: string; label: string; value: number; text: string; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-4 text-ink-3">Nothing in this range yet.</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate font-semibold">{r.label}</span>
            <span className={`shrink-0 text-ink-2 ${NUM}`}>
              <b className="text-ink">{r.text}</b>
              {r.sub && <span> · {r.sub}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 bg-[var(--gold-soft)]" role="presentation">
            <div className="h-full bg-[var(--color-ink-2)]" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** How much of the audience was still watching at each tenth of the film. One small chart per film. */
export function DropOff({ film }: { film: StatsTitleWatching }) {
  const W = 200, H = 72;
  const pts = [1, ...film.dropOff]; // everyone who started is there at 0%
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 2 - v * (H - 6)] as const);
  const line = xy.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-semibold">{film.name}</span>
        <span className={`shrink-0 text-sm text-ink-3 ${NUM}`}>{film.viewers} {film.viewers === 1 ? "viewer" : "viewers"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${film.name}: ${pct(film.dropOff[4] ?? 0)} reached the halfway point, ${pct(film.dropOff[9] ?? 0)} finished`}>
        <line x1="0" x2={W} y1={H - 2} y2={H - 2} stroke="var(--line-2)" />
        <line x1="0" x2={W} y1={(H - 6) / 2 + 2} y2={(H - 6) / 2 + 2} stroke="var(--line)" strokeDasharray="2 4" />
        <path d={`${line} L${W} ${H - 2} L0 ${H - 2} Z`} fill="var(--gold-soft)" />
        <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
        {xy.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r="7" fill="transparent">
            <title>{`${i * 10}% in: ${pct(pts[i]!)} still watching`}</title>
          </circle>
        ))}
      </svg>
      <div className={`mt-1 flex justify-between text-[12px] text-ink-3 ${NUM}`}>
        <span>Start</span>
        <span>Half: {pct(film.dropOff[4] ?? 0)}</span>
        <span>End: {pct(film.dropOff[9] ?? 0)}</span>
      </div>
      <div className={`mt-2 text-sm text-ink-2 ${NUM}`}>
        Avg watched {formatDuration(film.avgWatchSec)} · {pct(film.completionRate)} finished
      </div>
    </div>
  );
}
