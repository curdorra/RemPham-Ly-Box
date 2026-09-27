import type { TitleSummary } from "@ott/shared";
import { TitleCard } from "./TitleCard";

export function TitleGrid({ titles }: { titles: TitleSummary[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
      {titles.map((t) => (
        <div key={t.id} className="[&>a]:w-full">
          <TitleCard title={t} />
        </div>
      ))}
    </div>
  );
}
