import type { HomeFeed } from "@ott/shared";
import { ContinueWatchingRow } from "@/components/ContinueWatchingRow";
import { Hero } from "@/components/Hero";
import { Row } from "@/components/Row";
import { apiGet, getContinueWatching, getMe } from "@/lib/api-server";

export default async function HomePage() {
  const [feed, me] = await Promise.all([apiGet<HomeFeed>("/catalog/home"), getMe()]);
  const continueWatching = me ? await getContinueWatching() : [];

  return (
    <div className="space-y-8">
      {feed.hero ? <Hero title={feed.hero} /> : <div className="h-24" />}
      <div className="relative -mt-12 space-y-8">
        <ContinueWatchingRow items={continueWatching} />
        {feed.rows.map((row) => (
          <Row key={row.id} label={row.label} titles={row.titles} />
        ))}
      </div>
    </div>
  );
}
