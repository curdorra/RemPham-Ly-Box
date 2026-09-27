# RemPham Ly Box

A subscription video-on-demand (SVOD) OTT platform: movies and series, HLS
streaming, accounts, continue watching, My List, and Stripe subscriptions.

## Architecture

```
apps/
  api/        Express 5 + Prisma (PostgreSQL) — auth, catalog, entitlement, billing
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
- **Entitlement**: the catalog never exposes stream URLs. `POST /playback` checks sign-in + an active
  subscription, then returns a time-limited manifest URL (HMAC-signed when `CDN_SIGNING_KEY` is set) with the
  resume position and the next episode.
- **Billing**: Stripe Checkout for sign-up, the Stripe Customer Portal for changes/cancellation, and webhooks
  (`POST /billing/webhook`) as the source of truth for subscription state. Without `STRIPE_SECRET_KEY`
  (non-production only) **dev billing** activates plans instantly so you can develop without Stripe.

## Getting started

Requires Node 20.19+ and Docker (or any PostgreSQL 16).

```bash
npm install
npm run db:up                               # Postgres via docker compose
cp apps/api/.env.example apps/api/.env      # then set JWT_SECRET
npm run db:migrate                          # apply migrations
npm run db:seed                             # demo catalog
npm run dev                                 # api on :4000, web on :3000
```

Open http://localhost:3000, sign up, choose a plan (instant in dev billing) and press Play.

The demo catalog streams public HLS test assets (Blender Foundation open movies, CC-BY) and uses
picsum.photos placeholder artwork.

### Tests

```bash
createdb -O ott ott_test   # once; or set TEST_DATABASE_URL
npm test                   # resets + seeds the test DB, then runs API integration tests
```

### Stripe

1. Create three recurring prices (Basic / Standard / Premium) and set `STRIPE_PRICE_*`.
2. Set `STRIPE_SECRET_KEY`.
3. Forward webhooks locally: `stripe listen --forward-to localhost:4000/billing/webhook`, and set
   `STRIPE_WEBHOOK_SECRET` from its output. Subscribe to `checkout.session.completed` and
   `customer.subscription.{created,updated,deleted}`.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | – | Session management |
| GET | `/auth/me` | user | Profile, subscription, `canWatch` |
| GET | `/catalog/home` | – | Hero + rows |
| GET | `/catalog/titles?q=&genre=&type=&limit=&offset=` | – | Search / browse |
| GET | `/catalog/titles/:slug` | – | Title detail, seasons, episodes |
| GET | `/catalog/genres` | – | Genres with published titles |
| POST | `/playback` `{titleId, episodeId?}` | subscriber | Playback grant (manifest URL, resume point) |
| PUT | `/me/progress` | user | Report playhead |
| GET | `/me/continue-watching` | user | In-progress titles |
| GET/PUT/DELETE | `/me/list[/:titleId]` | user | My List |
| GET | `/billing/plans` | – | Plans |
| POST | `/billing/checkout` `{planId}` | user | Stripe Checkout URL |
| POST | `/billing/portal` | user | Stripe Customer Portal URL |
| POST | `/billing/webhook` | Stripe signature | Subscription sync |

## Roadmap

- [ ] Admin/CMS: title & episode management, artwork upload, publish scheduling
- [ ] Ingest pipeline: upload → transcode to an HLS/CMAF ladder (e.g. AWS MediaConvert or Mux) → CDN
- [ ] DRM (Widevine / FairPlay / PlayReady) and concurrent-stream limits per plan
- [ ] Viewer profiles (incl. kids profiles with maturity limits)
- [ ] Recommendations and trending rows
- [ ] Subtitles / audio tracks UI, skip intro, thumbnails on the scrubber
- [ ] Mobile & TV clients
