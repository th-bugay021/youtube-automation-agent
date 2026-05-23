# Architecture

## Overview
A semi-autonomous YouTube content management system. Three planes:

1. **Control plane** — Next.js dashboard. User logs in with Google, links channels, reviews AI suggestions, approves scheduled posts.
2. **API plane** — NestJS service. Handles auth, persistence, OpenAI calls, YouTube Data API v3 calls, request validation, rate limiting.
3. **Worker plane** — BullMQ workers. Process upload jobs, refresh OAuth tokens, run scheduled publishes, fetch analytics on a cadence.

```
+-------------+      HTTPS       +------------------+
| Next.js     | <--------------> | NestJS API       |
| (Vercel)    |   JWT cookie     | (Railway)        |
+-------------+                  +---------+--------+
                                           |
                              +------------+------------+
                              |            |            |
                          PostgreSQL    Redis       OpenAI / YouTube
                          (Neon)        (Upstash)   (external)
                                           |
                                     BullMQ workers
                                     (Railway)
```

## Key design decisions

### Token security
OAuth refresh tokens are encrypted at rest using AES-256-GCM (`src/crypto/crypto.service.ts`). The encryption key lives in env (`TOKEN_ENCRYPTION_KEY`, 32 bytes hex). Access tokens are kept in memory only when needed and never logged. Token refresh is opportunistic: every YouTube API call goes through `YoutubeClientFactory.forChannel(channelId)`, which checks expiry and refreshes before issuing the call.

### Multi-channel model
A `User` has many `Channels` (one per linked YouTube channel). Each `Channel` owns its own OAuth credential row. This lets one user manage multiple channels with separate tokens and separate analytics.

### Automation modes
Each channel has an `automationMode` enum:
- `MANUAL` — AI suggests, user approves every step.
- `RECOMMEND` — AI generates and queues drafts, user reviews before publish.
- `SEMI_AUTO` — AI generates, schedules, and publishes; user can veto within a configurable hold window.
- `FULL_AUTO` — AI generates, schedules, and publishes without hold.

The publish worker checks the mode before flipping a video from `SCHEDULED` to `PUBLISHED`.

### Scheduling engine
`SchedulingService.suggestBestTime(channelId)` does two things:
1. Pulls the channel's last 90 days of analytics (`AnalyticsSnapshot` rows).
2. Buckets views by `(dayOfWeek, hour)` weighted by `(views * avgViewDuration)`. The top bucket wins.

If the channel has fewer than 10 published videos, it falls back to a niche-based default heuristic (Tue/Thu 14:00 viewer-local) — configurable per channel.

### Upload pipeline
1. User (or AI) creates a `Video` row in state `DRAFT`.
2. AI engine enriches with title/description/tags/thumbnail concept.
3. User approves → state `SCHEDULED` with `publishAt`.
4. Worker picks up at `publishAt`, calls `YoutubeUploadService.uploadResumable()`, transitions state to `PUBLISHED` or `FAILED`.
5. Failed uploads retry with exponential backoff (max 5 attempts) via BullMQ.

### Rate limiting and quotas
- API edge: `@nestjs/throttler` (100 req/min per IP).
- YouTube quota: tracked per-channel in `youtube_quota_usage` table. Workers refuse to upload when daily quota is exhausted; the job is rescheduled past the quota window.
- OpenAI: `OpenAiService` enforces a token budget per user per day and caches identical prompts for 24h.

### Logging
Pino (`nestjs-pino`) at the HTTP level. Worker logs use the same logger via dependency injection. Sensitive fields (`accessToken`, `refreshToken`, `Authorization` headers) are redacted by a Pino redact path.

### Error handling
- `AllExceptionsFilter` converts thrown errors to a normalised JSON envelope `{ error: { code, message, requestId } }`.
- `YoutubeApiError`, `OpenAiQuotaError`, `AuthError`, `ValidationError` are typed and mapped to HTTP codes in the filter.
- Workers wrap every job handler in a try/catch that emits a structured failure event consumed by the notifications module.

### Security checklist
- Helmet middleware on the API.
- CSRF protection on state-changing routes (double-submit cookie).
- All inputs validated with `class-validator` DTOs; `whitelist: true, forbidNonWhitelisted: true` on the global pipe.
- JWT in httpOnly, secure, sameSite=lax cookies. Refresh rotation on every use.
- Argon2id for any local password fallback (admin seed).
- CORS locked to the configured frontend origin.
- Rate limiting per IP and per user.

## Folder layout
```
backend/
  prisma/
    schema.prisma
  src/
    main.ts
    app.module.ts
    config/
    common/        # guards, filters, interceptors, decorators
    prisma/        # Prisma service
    crypto/        # AES-256-GCM token encryption
    auth/          # Google OAuth + JWT
    users/
    channels/
    youtube/       # YouTube Data API v3 client
    videos/        # uploads + metadata
    ai/            # OpenAI integration, prompt modules
    scheduling/    # best-time predictor
    queue/         # BullMQ workers
    analytics/
    notifications/
frontend/
  src/
    app/           # Next.js App Router
    components/
    lib/           # api client
    providers/     # theme, query, auth
```

## Scaling
- Stateless API horizontally scales behind a load balancer.
- Workers scale independently; queues are partitioned per concern (`uploads`, `analytics`, `ai`).
- DB connection pooling via PgBouncer (Neon ships this).
- Redis used for queues + rate limiting only; not as a cache for now to keep blast radius small.
- Per-channel quota tracking keeps any single account from being throttled by YouTube.

## Deployment
- **Frontend**: Vercel. `NEXT_PUBLIC_API_URL` points to the Railway backend.
- **Backend**: Railway. One service for the HTTP API, a second service running the same image with `npm run start:worker` for the BullMQ workers.
- **Database**: Neon (Postgres) or Supabase.
- **Redis**: Upstash.
- **Secrets**: Railway environment variables, mirrored in Vercel for the frontend public vars only.
