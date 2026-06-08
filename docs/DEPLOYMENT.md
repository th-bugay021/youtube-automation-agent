# Deployment

## Frontend — Vercel
1. Push the repo to GitHub.
2. In Vercel, create a project pointed at `frontend/`.
3. Set env:
   - `NEXT_PUBLIC_API_URL` → your Railway backend URL (e.g. `https://api.ytauto.app`).
4. Deploy. Vercel will detect Next.js 14 automatically.

## Backend — Railway
1. Create a Railway project, attach two services from the same repo / `backend` directory:
   - **API**: build = `npm install && npm run prisma:generate && npm run build`, start = `npm run start`.
   - **Worker**: same image, start = `npm run start:worker`.
2. Add a Postgres plugin (or use Neon and paste the connection string into `DATABASE_URL`).
3. Add a Redis plugin (or use Upstash and paste into `REDIS_URL`).
4. Set env vars (see `backend/.env.example`). Mirror **all** values across both services.
   - For separate frontend/backend hosts, set `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none`.
   - Leave `COOKIE_DOMAIN` empty unless both services use a shared parent domain you control.
5. Migrations apply automatically: the API runs `prisma migrate deploy` at startup
   (see `backend/src/main.ts`) before it listens, so a fresh deploy brings the schema
   up to date on its own. Set `MIGRATE_ON_STARTUP=false` to opt out and run migrations
   manually instead. (This replaces the need for a platform pre-deploy hook — handy on
   hosts like Render's free tier that don't offer one.)

## Google Cloud / YouTube API
1. Create a Google Cloud project.
2. Enable **YouTube Data API v3** and **YouTube Analytics API**.
3. OAuth consent screen: external, add the scopes:
   - `userinfo.email`
   - `userinfo.profile`
   - `https://www.googleapis.com/auth/youtube`
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
4. Create OAuth credentials (Web application). Add the redirect URI `${BACKEND_URL}/api/auth/google/callback`.
5. Submit for verification before going public — uploads require a verified app for non-test users.

## OpenAI
1. Get an API key from platform.openai.com.
2. Set `OPENAI_API_KEY` on both API and Worker services.
3. The default model is `gpt-4o-mini`; override via `OPENAI_MODEL`.

## Token encryption key
Generate once and store in env:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Use the output as `TOKEN_ENCRYPTION_KEY`. **Rotating this key invalidates every stored OAuth refresh token** — keep it stable.

## First-run checklist
- [ ] On boot the API logs `Applying database migrations` then `Database migrations up to date`.
- [ ] `GET /api/auth/me` returns 401 (proves the auth pipeline is wired).
- [ ] Visiting the frontend `/login` and clicking Google completes and lands on `/dashboard`.
- [ ] After login, `GET ${BACKEND_URL}/api/channels` returns the channels you authorised.
- [ ] Worker logs show `Worker ready`.
