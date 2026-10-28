/**
 * Seeds a demo catalog. Streams are public HLS test assets (Blender Foundation
 * open movies, CC-BY). The Blender films use their real posters and stills from
 * Wikimedia Commons; everything else gets picsum.photos placeholders.
 * Safe to re-run: it upserts by slug.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import type { Maturity, TitleType } from "../src/generated/prisma/client.js";

// Same `?schema=` handling as src/lib/db.ts (kept local so seeding doesn't need the app config).
const dbUrl = new URL(process.env.DATABASE_URL!);
const schema = dbUrl.searchParams.get("schema") ?? undefined;
dbUrl.searchParams.delete("schema");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl.toString() }, { schema }) });

const STREAMS = {
  bigBuckBunny: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  tearsOfSteel: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
  appleBipBop: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  muxTos: "https://test-streams.mux.dev/tos_ismc/main.m3u8",
  sintel: "https://storage.googleapis.com/shaka-demo-assets/sintel-fmp4-aes/master.m3u8",
};
const streamList = [STREAMS.bigBuckBunny, STREAMS.tearsOfSteel, STREAMS.appleBipBop, STREAMS.muxTos];

const art = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const commons = (path: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${path}`;

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
  directors?: string[];
  tags?: string[];
  language?: string;
  altNames?: string[];
  /** Movies: [introStart, introEnd, creditsStart] in seconds. */
  markers?: [number, number, number];
  featured?: boolean;
  /** Ticket price in rupees. */
  price: number;
  rentalHours?: number;
  /** Days from now until an opening night at 7 PM IST (creates a screening). */
  openingNightInDays?: number;
  durationSec?: number;
  manifestUrl?: string;
  /** Real artwork; picsum placeholders otherwise. */
  posterUrl?: string;
  backdropUrl?: string;
  seasons?: { name: string; episodes: string[] }[];
}

const TITLES: SeedTitle[] = [
  {
    slug: "sintel",
    directors: ["Colin Levy"],
    tags: ["fantasy", "dragons", "quest"],
    language: "English",
    markers: [0, 45, 800],
    price: 99,
    openingNightInDays: 5,
    type: "MOVIE",
    name: "Sintel",
    synopsis: "A lonely young woman searches the world for the baby dragon she once rescued. Opens with an opening night.",
    year: 2010,
    maturity: "PG13",
    genres: ["animation", "drama"],
    cast: ["Halina Reijn", "Thom Hoffman"],
    featured: true,
    durationSec: 888,
    manifestUrl: STREAMS.sintel,
    posterUrl: commons("8/8f/Sintel_poster.jpg/960px-Sintel_poster.jpg"),
    backdropUrl: commons("f/f1/Sintel_movie_4K.webm/1920px--Sintel_movie_4K.webm.jpg"),
  },
  {
    slug: "big-buck-bunny",
    directors: ["Sacha Goedegebure"],
    tags: ["family", "funny", "short"],
    language: "English",
    markers: [0, 25, 575],
    price: 49,
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
    posterUrl: commons("c/c5/Big_buck_bunny_poster_big.jpg/960px-Big_buck_bunny_poster_big.jpg"),
    backdropUrl: commons("c/c0/Big_Buck_Bunny_4K.webm/1920px--Big_Buck_Bunny_4K.webm.jpg"),
  },
  {
    slug: "tears-of-steel",
    directors: ["Ian Hubert"],
    tags: ["robots", "future", "action"],
    language: "English",
    markers: [0, 30, 690],
    price: 79,
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
    posterUrl: commons("7/70/Tos-poster.png/960px-Tos-poster.png"),
    backdropUrl: commons("c/cb/Tears_of_Steel_1080p.webm/1920px--Tears_of_Steel_1080p.webm.jpg"),
  },
  {
    slug: "signal-test",
    directors: ["Apple Developer"],
    tags: ["short"],
    language: "English",
    price: 29,
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
    directors: ["Mai Tran"],
    tags: ["mystery", "small town", "storm"],
    language: "Mizo",
    altNames: ["Hmun Rei Taka Harbor"],
    price: 149,
    rentalHours: 168,
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
    directors: ["Hana Sato"],
    tags: ["food", "funny", "space"],
    language: "English",
    price: 99,
    rentalHours: 168,
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
    directors: ["Amara Okafor"],
    tags: ["nature", "animals", "family"],
    language: "English",
    price: 99,
    rentalHours: 168,
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
      pricePaise: t.price * 100,
      directors: t.directors ?? [],
      tags: t.tags ?? [],
      language: t.language ?? "Mizo",
      altNames: t.altNames ?? [],
      introStartSec: t.markers?.[0] ?? null,
      introEndSec: t.markers?.[1] ?? null,
      creditsStartSec: t.markers?.[2] ?? null,
      rentalHours: t.rentalHours ?? 48,
      durationSec: t.durationSec ?? null,
      manifestUrl: t.manifestUrl ?? null,
      posterUrl: t.posterUrl ?? art(`${t.slug}-poster`, 400, 600),
      backdropUrl: t.backdropUrl ?? art(`${t.slug}-backdrop`, 1600, 900),
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
  // Opening nights: one per title that has one, created only if missing.
  for (const t of TITLES.filter((x) => x.openingNightInDays)) {
    const title = await prisma.title.findUniqueOrThrow({ where: { slug: t.slug } });
    if (await prisma.screening.count({ where: { titleId: title.id } })) continue;
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + t.openingNightInDays!);
    startsAt.setUTCHours(13, 30, 0, 0); // 7:00 PM IST
    await prisma.screening.create({ data: { titleId: title.id, startsAt } });
  }

  // Partner kitchen menu. Local items are placeholders to confirm with the kitchen.
  const kitchen =
    (await prisma.kitchen.findFirst({ where: { name: "Demo Partner Kitchen" } })) ??
    (await prisma.kitchen.create({ data: { name: "Demo Partner Kitchen", phone: "+91 90000 00000" } }));
  const SNACKS = [
    ["butter-popcorn", "Butter popcorn", "Large tub, freshly popped", 120],
    ["caramel-popcorn", "Caramel popcorn", "Salted caramel, large tub", 140],
    ["sanpiau", "Sanpiau", "Local favourite, warm bowl", 80],
    ["chowmein", "Chowmein", "Veg or pork", 110],
    ["thingpui", "Thingpui", "Hot tea, a flask for two", 30],
    ["cold-drink", "Cold drink", "Chilled, 500 ml", 50],
  ] as const;
  for (const [i, [slug, name, description, rupees]] of SNACKS.entries()) {
    const data = { name, description, pricePaise: rupees * 100, sort: i, kitchenId: kitchen.id };
    await prisma.snackItem.upsert({ where: { slug }, create: { slug, ...data }, update: data });
  }

  // Our physical cinema. Booking is on BookMyShow; {date} is YYYYMMDD.
  const cinema = await prisma.cinema.upsert({
    where: { slug: "remphamly-aizawl" },
    create: {
      slug: "remphamly-aizawl",
      name: "RemPhamLy Cinema",
      city: "Aizawl",
      address: "Aizawl, Mizoram",
      bookingUrlTemplate: "https://in.bookmyshow.com/cinemas/aizawl/remphamly-cinema-aizawl/buytickets/RHCA/{date}",
    },
    update: {},
  });
  // Placeholder showtimes for local development only — staff enter real ones.
  if (!(await prisma.showtime.count({ where: { cinemaId: cinema.id, startsAt: { gte: new Date() } } }))) {
    const bySlug = new Map((await prisma.title.findMany({ select: { id: true, slug: true, name: true } })).map((t) => [t.slug, t]));
    const plan = [
      ["sintel", 7, 0], // 12:30 IST (UTC 07:00)
      ["tears-of-steel", 10, 0], // 15:30 IST
      ["sintel", 12, 30], // 18:00 IST
    ] as const;
    for (let day = 1; day <= 3; day++) {
      for (const [slug, h, m] of plan) {
        const t = bySlug.get(slug)!;
        const startsAt = new Date();
        startsAt.setUTCDate(startsAt.getUTCDate() + day);
        startsAt.setUTCHours(h, m, 0, 0);
        await prisma.showtime.create({ data: { cinemaId: cinema.id, titleId: t.id, filmName: t.name, startsAt, format: "2D" } });
      }
    }
  }

  console.log(`Seeded ${GENRES.length} genres, ${TITLES.length} titles, ${SNACKS.length} snacks and cinema ${cinema.name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
