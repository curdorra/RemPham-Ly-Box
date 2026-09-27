/**
 * Seeds a demo catalog. Streams are public HLS test assets (Blender Foundation
 * open movies, CC-BY) and artwork comes from picsum.photos placeholders.
 * Safe to re-run: it upserts by slug.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { Maturity, TitleType } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const STREAMS = {
  bigBuckBunny: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  tearsOfSteel: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
  appleBipBop: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  muxTos: "https://test-streams.mux.dev/tos_ismc/main.m3u8",
};
const streamList = Object.values(STREAMS);

const art = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const GENRES = [
  ["animation", "Animation"],
  ["sci-fi", "Sci-Fi"],
  ["drama", "Drama"],
  ["comedy", "Comedy"],
  ["thriller", "Thriller"],
  ["documentary", "Documentary"],
  ["family", "Family"],
] as const;

interface SeedTitle {
  slug: string;
  type: TitleType;
  name: string;
  synopsis: string;
  year: number;
  maturity: Maturity;
  genres: string[];
  cast: string[];
  featured?: boolean;
  durationSec?: number;
  manifestUrl?: string;
  seasons?: { name: string; episodes: string[] }[];
}

const TITLES: SeedTitle[] = [
  {
    slug: "big-buck-bunny",
    type: "MOVIE",
    name: "Big Buck Bunny",
    synopsis: "A giant, gentle rabbit takes a stand against three bullying rodents in this Blender Foundation open movie.",
    year: 2008,
    maturity: "G",
    genres: ["animation", "comedy", "family"],
    cast: ["Blender Foundation"],
    featured: true,
    durationSec: 596,
    manifestUrl: STREAMS.bigBuckBunny,
  },
  {
    slug: "tears-of-steel",
    type: "MOVIE",
    name: "Tears of Steel",
    synopsis: "In a future Amsterdam, a group of scientists attempt to save the world from destructive robots.",
    year: 2012,
    maturity: "PG13",
    genres: ["sci-fi", "thriller"],
    cast: ["Derek de Lint", "Sergio Hasselbaink", "Rogier Schippers"],
    featured: true,
    durationSec: 734,
    manifestUrl: STREAMS.tearsOfSteel,
  },
  {
    slug: "signal-test",
    type: "MOVIE",
    name: "Signal Test",
    synopsis: "A short about calibration, color bars, and the quiet beauty of a perfectly-aligned picture.",
    year: 2016,
    maturity: "G",
    genres: ["documentary"],
    cast: ["Apple Developer"],
    durationSec: 1800,
    manifestUrl: STREAMS.appleBipBop,
  },
  {
    slug: "the-long-harbor",
    type: "SERIES",
    name: "The Long Harbor",
    synopsis: "A fishing town's secrets surface when a storm washes a stranger ashore.",
    year: 2025,
    maturity: "TV14",
    genres: ["drama", "thriller"],
    cast: ["Mai Tran", "Oliver Hart", "Leila Moreau"],
    featured: true,
    seasons: [
      { name: "Season 1", episodes: ["The Storm", "Salt", "Low Tide", "Lanterns", "The Wreck", "Homecoming"] },
      { name: "Season 2", episodes: ["Undertow", "Northern Lights", "Anchor", "Driftwood"] },
    ],
  },
  {
    slug: "orbit-kitchen",
    type: "SERIES",
    name: "Orbit Kitchen",
    synopsis: "Chefs aboard a space station improvise meals with whatever the last cargo drop brought.",
    year: 2024,
    maturity: "TVPG",
    genres: ["comedy", "sci-fi"],
    cast: ["Ravi Kapoor", "Hana Sato", "Jules Brenner"],
    seasons: [{ name: "Season 1", episodes: ["Zero-G Bread", "Freeze Dried", "The Tomato", "Reentry Feast"] }],
  },
  {
    slug: "wild-deltas",
    type: "SERIES",
    name: "Wild Deltas",
    synopsis: "A journey through the world's great river deltas and the creatures that depend on them.",
    year: 2023,
    maturity: "TVY",
    genres: ["documentary", "family"],
    cast: ["Narrated by Amara Okafor"],
    seasons: [{ name: "Season 1", episodes: ["Mekong", "Nile", "Okavango", "Ganges"] }],
  },
];

async function main() {
  const genreIds = new Map<string, string>();
  for (const [slug, name] of GENRES) {
    const g = await prisma.genre.upsert({ where: { slug }, create: { slug, name }, update: { name } });
    genreIds.set(slug, g.id);
  }

  let streamIdx = 0;
  for (const t of TITLES) {
    const base = {
      type: t.type,
      name: t.name,
      synopsis: t.synopsis,
      year: t.year,
      maturity: t.maturity,
      cast: t.cast,
      featured: t.featured ?? false,
      durationSec: t.durationSec ?? null,
      manifestUrl: t.manifestUrl ?? null,
      posterUrl: art(`${t.slug}-poster`, 400, 600),
      backdropUrl: art(`${t.slug}-backdrop`, 1600, 900),
      genres: { set: t.genres.map((g) => ({ id: genreIds.get(g)! })) },
    };
    const title = await prisma.title.upsert({
      where: { slug: t.slug },
      create: { slug: t.slug, ...base, genres: { connect: base.genres.set } },
      update: base,
    });

    for (const [si, season] of (t.seasons ?? []).entries()) {
      const s = await prisma.season.upsert({
        where: { titleId_number: { titleId: title.id, number: si + 1 } },
        create: { titleId: title.id, number: si + 1, name: season.name },
        update: { name: season.name },
      });
      for (const [ei, epName] of season.episodes.entries()) {
        const ep = {
          name: epName,
          synopsis: `${t.name} — S${si + 1}E${ei + 1}: ${epName}.`,
          durationSec: 600 + ((si * 7 + ei * 3) % 5) * 60,
          thumbnailUrl: art(`${t.slug}-s${si + 1}e${ei + 1}`, 480, 270),
          manifestUrl: streamList[streamIdx++ % streamList.length]!,
        };
        await prisma.episode.upsert({
          where: { seasonId_number: { seasonId: s.id, number: ei + 1 } },
          create: { seasonId: s.id, number: ei + 1, ...ep },
          update: ep,
        });
      }
    }
  }
  console.log(`Seeded ${GENRES.length} genres and ${TITLES.length} titles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
