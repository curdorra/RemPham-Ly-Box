# Hosting RemPham Ly Box (free tier)

| Part | Service | Notes |
|---|---|---|
| Website | Vercel | Root directory `apps/web`. Env: `API_URL` = the Render API URL |
| API | Render (`render.yaml`, Docker) | Free plan sleeps after 15 min idle |
| Database | Supabase (Postgres) | Use the **Session pooler** connection string for `DATABASE_URL` |
| Films | Cloudflare R2 | Public bucket URL goes in `MEDIA_BASE_URL` |

## Order of work
1. **Supabase**: new project (region Mumbai or Singapore). Copy the Session pooler URI, with `?sslmode=require` on the end.
2. **Render**: New → Blueprint → this repo. Set `DATABASE_URL`, `WEB_ORIGIN` (the Vercel URL, once known), and the Razorpay values. The API applies migrations on every start.
3. **Vercel**: import the repo, root directory `apps/web`, set `API_URL`.
4. **Seed once** (demo catalog): `DATABASE_URL=<supabase url> npm run db:seed -w @ott/api`.
5. **R2**: create a bucket, enable its public `r2.dev` URL, create an API token (Object Read & Write). Then:
   ```
   export R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… MEDIA_BASE_URL=https://pub-xxxx.r2.dev
   npm run publish-film -w @ott/api -- --setup-cors https://<your-site>.vercel.app
   DATABASE_URL=<supabase url> npm run publish-film -w @ott/api -- ~/Downloads/film.mp4 <title-slug>
   ```
   Subtitles (SRT or WebVTT) can go in at publish time with `--sub en=film.en.srt --sub lus=film.lus.srt`,
   or be added to a film that's already up without converting it again:
   `npm run publish-film -w @ott/api -- --subs <title-slug> en=film.en.srt`. Viewers choose them in the player.
   For artwork uploads from the staff screens, also set the same five `R2_*` / `MEDIA_BASE_URL` values on **Render**.
   Without them, uploading in production says so and staff can paste image URLs instead.
6. Make yourself staff: `DATABASE_URL=<supabase url> npm run make-admin -w @ott/api -- you@email.com`.

## Locking films (before paid releases)
Until this is done, anyone with a film's R2 link can watch it. `apps/media-worker` is a Cloudflare Worker on
`media.remphamly.com/films/*` that only serves a film with the expiring link from `POST /playback`. Artwork stays public.

Do these steps in order. If the Worker goes live before the API has the key, every film returns 403.
1. Make a key: `openssl rand -base64 32`.
2. **Render**: set `CDN_SIGNING_KEY` to that key and let the API redeploy. Films still play, with `?exp=…&sig=…` added.
3. **Worker** (log in once with `npx wrangler@4 login`):
   ```
   cd apps/media-worker
   npx wrangler@4 secret put SIGNING_KEY      # paste the same key
   npm run deploy
   ```
4. **R2**: turn off the bucket's public `r2.dev` URL. It bypasses the Worker.
5. Check: open a film on the site (it plays), then open its `master.m3u8` link without `?exp=…&sig=…` (it should say 403).

To change the key, repeat steps 2 and 3. Links already handed out stop working, and viewers reopen the film to get a new one.
Add a new web origin (for example a new preview domain) to `ALLOWED_ORIGINS` in `apps/media-worker/wrangler.toml`.
