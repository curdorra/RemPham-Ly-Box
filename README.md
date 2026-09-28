# RemPham Ly Box

An online cinema for Mizo films: pay per film (TVOD), opening nights where
everyone watches together, snacks delivered before the show, and a public box
office chart. HLS streaming, accounts, continue watching, My List, Razorpay.

## Architecture

```
apps/
  api/        Express 5 + Prisma (PostgreSQL) — auth, catalog, tickets, screenings, snacks, payments
  web/        Next.js (App Router) + Tailwind + hls.js — the viewer site
packages/
  shared/     Zod schemas and TypeScript types shared by api and web
```

```
Browser ──► Next.js (web :3000) ──/api/* rewrite──► Express API (:4000) ──► PostgreSQL
   │                                                    │
   └──── HLS manifest + segments ◄──── CDN / origin ◄───┘ (signed URL from POST /playback)
```

- **Sessions**: JWT in an httpOnly cookie. The web app proxies `/api/*` to the API so the cookie is first-party.
- **Tickets, not subscriptions**: each title is bought on its own. A ticket's window (`rentalHours`,
  48h by default) starts on first play. `STANDARD` = 1 screen; `TOGETHER` = 3 screens at once and +24h,
  for families watching from different places. Extra tickets in one order become gift codes.
- **Entitlement**: the catalog never exposes stream URLs. `POST /playback` checks for a playable ticket and
  claims a screen for the device (`PlaybackSession`, kept alive by heartbeats), then returns a time-limited
  manifest URL (HMAC-signed when `CDN_SIGNING_KEY` is set).
- **Opening nights** (`Screening`): one start time and a virtual seat map. A title with an upcoming opening
  night is only sold for that night. While live, grants carry `live.offsetSec` so every viewer is in sync
  (players must not allow seeking). Afterwards those tickets work on demand, with a fresh window.
- **Orders**: one checkout for tickets and/or snacks. Pending orders hold seats for `ORDER_HOLD_MIN`
  minutes. Payment is Razorpay (Orders API + Checkout; the webhook is the source of truth). Without
  `RAZORPAY_KEY_ID` (non-production only) **dev payments** confirm orders instantly.
- **Profiles**: up to 5 per account (a household shares tickets; each profile has its own history,
  My List, ratings and recommendations). Kids profiles only see G/PG/TV-Y/TV-PG titles — in the catalog,
  search, recommendations and playback. The current profile comes from the `rlb_profile` cookie
  (`PUT /profiles/current`) or an `x-profile-id` header.
- **Discovery**: an in-memory search index (typo-tolerant trigram matching, Mizo diacritics ignored,
  titles/alt names/cast/directors/genres/tags, "did you mean", suggestions). Recommendations blend
  content similarity, co-watching ("households who watched X also watched Y") and popularity; the home
  feed builds Continue watching, Top 10, Because you watched…, Recommended for you, Trending and
  genre rows ordered by the profile's taste. Thumbs down/up/love feed it.
- **Our cinema**: RemPhamLy Cinema's showtimes (entered by staff) with per-day BookMyShow links —
  BookMyShow has no public API, so booking stays there.
- **Snacks**: partner kitchens and menus; snack orders go to a staff queue (`/admin/snack-orders`) that
  moves them from PLACED → ACCEPTED → OUT_FOR_DELIVERY → DELIVERED.

## Getting started

Requires Node 20.19+ and PostgreSQL 16 — Docker, or no install at all with Prisma's local server
(see `.env.example` for the matching URLs):

```bash
npm install
npm run db:up                               # Postgres via docker compose, or:
# (cd apps/api && npx prisma dev -d --name ott -P 51214 --shadow-db-port 51215)
cp apps/api/.env.example apps/api/.env      # then set JWT_SECRET
npm run db:migrate                          # apply migrations
npm run db:seed                             # demo catalog
npm run dev                                 # api on :4000, web on :3000
```

Open http://localhost:3000, sign up, open a title, get a ticket (instant with dev payments) and press Play.
Make yourself staff with `npm run make-admin -w @ott/api -- you@example.com`.

The demo catalog streams public HLS test assets (Blender Foundation open movies, CC-BY) and uses
picsum.photos placeholder artwork.

### Tests

```bash
createdb -O ott ott_test   # once; or set TEST_DATABASE_URL
npm test                   # resets + seeds the test DB, then runs API integration tests
# With the local Prisma server, tests use their own schema on it instead:
# TEST_DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable&schema=test" npm test
```

### Razorpay

1. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (test mode keys to start).
2. Add a webhook to `https://<api>/payments/razorpay/webhook` for `payment.captured` and `order.paid`,
   and set `RAZORPAY_WEBHOOK_SECRET` to its secret.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | – | Session management |
| GET | `/auth/me` | user | Profile and role |
| GET | `/catalog/home`, `/catalog/titles`, `/catalog/titles/:slug`, `/catalog/genres` | – | Browse (includes prices) |
| POST | `/orders` `{titleId?, tier, quantity, screeningId?, seats?, snacks?, delivery?}` | user | Start a checkout |
| GET | `/orders`, `/orders/:id` | user | Paid orders / one order |
| POST | `/orders/:id/razorpay/verify` | user | Confirm a Razorpay Checkout payment |
| POST | `/orders/:id/confirm-dev` | user | Dev payments only |
| POST | `/payments/razorpay/webhook` | Razorpay signature | Payment sync |
| GET | `/tickets` | user | Your tickets and gifts to share |
| POST | `/tickets/redeem` `{code}` | user | Claim a gifted ticket |
| POST | `/playback` `{titleId, episodeId?, deviceId}` | ticket | Playback grant (manifest, resume or live offset) |
| POST | `/playback/heartbeat`, `/playback/release` `{ticketId, deviceId}` | ticket | Keep / free a screen |
| GET | `/screenings`, `/screenings/:id` | – | Opening nights, seat map |
| PUT/DELETE | `/screenings/:id/reminder` | user | Remind me |
| GET | `/snacks` | – | Snack menu |
| GET | `/search?q=`, `/search/suggest?q=` | – | Search, as-you-type suggestions |
| GET | `/catalog/titles/:slug/similar` | – | More like this |
| GET/POST/PATCH/DELETE | `/profiles[/:id]`, PUT `/profiles/current` | user | Profiles, "Who's watching?" |
| PUT/DELETE | `/me/ratings/:titleId` `{value: -1\|1\|2}`, GET `/me/history` | user | Ratings, watch history |
| GET | `/cinema/:slug?days=7` | – | Physical cinema showtimes + BookMyShow links |
| POST/DELETE | `/admin/showtimes[/:id]` | admin | Enter cinema showtimes |
| GET | `/box-office?days=7` | – | Ticket chart with trends |
| GET/PATCH | `/admin/snack-orders[/:id]` | admin | Kitchen queue |
| GET | `/admin/sales?days=30` | admin | Tickets and gross per title |
| PUT | `/me/progress`, GET `/me/continue-watching`, GET/PUT/DELETE `/me/list[/:titleId]` | user | Viewer state |

## Roadmap

- [ ] Admin/CMS: titles, screenings, prices, kitchens; artwork upload, publish scheduling
- [ ] Watch-together sync for on-demand viewing (play/pause shared across a family's screens)
- [ ] Reminder delivery (WhatsApp/SMS) and kitchen notifications for new snack orders
- [ ] Ticket stubs loyalty (every 5th film free), filmmaker revenue dashboard, refunds
- [ ] Ingest pipeline: upload → transcode to an HLS/CMAF ladder (e.g. AWS MediaConvert or Mux) → CDN
- [ ] DRM (Widevine / FairPlay / PlayReady) and forensic watermarking
- [ ] Tune recommendation weights on real data; A/B test rows
- [ ] Subtitles / audio tracks UI, skip-intro button (markers exist), thumbnails on the scrubber
- [ ] Profile PIN lock; offline downloads (needs native apps)
- [ ] Mobile & TV clients
