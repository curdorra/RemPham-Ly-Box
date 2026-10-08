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
6. Make yourself staff: `DATABASE_URL=<supabase url> npm run make-admin -w @ott/api -- you@email.com`.

Film links are public to anyone who finds them. Before paid releases, add expiring links (the API already signs manifest URLs when `CDN_SIGNING_KEY` is set; R2 needs a small Worker to check them).
