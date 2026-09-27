import type { TitleSummary } from "@ott/shared";
import { TitleCard } from "./TitleCard";

export function Row({ label, titles }: { label: string; titles: TitleSummary[] }) {
  return (
    <section className="space-y-2">
      <h2 className="px-4 text-lg font-semibold sm:px-10">{label}</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2 sm:px-10">
        {titles.map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </section>
  );
}
