import type { TitleSummary } from "@ott/shared";
import { PosterCard } from "./Row";

export function TitleGrid({ titles }: { titles: TitleSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {titles.map((t) => (
        <PosterCard key={t.id} title={t} />
      ))}
    </div>
  );
}
