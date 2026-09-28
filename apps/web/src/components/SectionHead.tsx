export function SectionHead({ label, title, sub, live }: { label: string; title: string; sub?: string; live?: boolean }) {
  return (
    <div className="sec-head flex flex-wrap items-end justify-between gap-5">
      <div>
        <div className="lbl rule-after flex items-center gap-2.5 text-gold">
          {live && <span className="live-dot" />}
          {label}
        </div>
        <h2>{title}</h2>
      </div>
      {sub && <p>{sub}</p>}
    </div>
  );
}
