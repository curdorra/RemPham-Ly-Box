import type { Ticket } from "@ott/shared";
import { formatShowtime } from "@/lib/format";

/** A deterministic QR-looking pattern from the ticket id (visual only). */
function QrMark({ seed }: { seed: string }) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 233280, 7);
  const cells: [number, number][] = [];
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      if (finder(x, y)) continue;
      s = (s * 9301 + 49297) % 233280;
      if (s / 233280 > 0.52) cells.push([x, y]);
    }
  return (
    <svg viewBox="0 0 21 21" className="h-[78px] w-[78px] shrink-0" fill="#1f2629" shapeRendering="crispEdges" aria-hidden="true">
      {[[0, 0], [14, 0], [0, 14]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <rect x={x! + 0.5} y={y! + 0.5} width="6" height="6" fill="none" stroke="#1f2629" />
          <rect x={x! + 2} y={y! + 2} width="3" height="3" />
        </g>
      ))}
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
      ))}
    </svg>
  );
}

export interface ETicketLabels {
  seat: string;
  where: string;
  atHome: string;
  validFor: string;
  screens: string;
  paidL: string;
  booking: string;
  anyTime: string;
  showAtCinema: string;
  hoursToFinish: string;
  standard: string;
  together: string;
}

export function ETicket({ ticket, labels, paidPaise, perfBg }: { ticket: Ticket; labels: ETicketLabels; paidPaise?: number; perfBg?: string }) {
  const valid = ticket.screening
    ? formatShowtime(ticket.screening.startsAt)
    : ticket.expiresAt
      ? `until ${new Date(ticket.expiresAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
      : `${ticket.title.rentalHours + (ticket.tier === "TOGETHER" ? 24 : 0)} ${labels.hoursToFinish}`;
  return (
    <div className="eticket animate-rise" style={perfBg ? ({ "--perf-bg": perfBg } as React.CSSProperties) : undefined}>
      <div className="relative h-[118px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ticket.title.backdropUrl} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
        <b className="absolute bottom-3 left-[18px] display text-[30px] leading-none text-white">{ticket.title.name}</b>
        <span className="chip absolute top-3 right-3 bg-ox text-ink">{ticket.tier === "TOGETHER" ? labels.together : labels.standard}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-[18px] py-4">
        {ticket.seat ? (
          <div><dt>{labels.seat}</dt><dd>{ticket.seat}</dd></div>
        ) : (
          <div><dt>{labels.where}</dt><dd>{labels.atHome}</dd></div>
        )}
        <div><dt>{labels.validFor}</dt><dd>{valid}</dd></div>
        <div><dt>{labels.screens}</dt><dd>{ticket.screens}</dd></div>
        {paidPaise !== undefined && <div><dt>{labels.paidL}</dt><dd>₹{paidPaise / 100}</dd></div>}
      </dl>
      <div className="perf" />
      <div className="flex items-center gap-4 px-[18px] py-4">
        <QrMark seed={ticket.id} />
        <div>
          <small className="block text-xs text-[rgba(31,38,41,.6)]">{labels.booking}</small>
          <b className="text-sm tracking-[.08em] text-[#1f2629]">RLB-{ticket.id.slice(-8).toUpperCase()}</b>
          <small className="mt-1 block text-xs text-[rgba(31,38,41,.6)]">{labels.showAtCinema}</small>
        </div>
      </div>
    </div>
  );
}
