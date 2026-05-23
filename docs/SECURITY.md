# Security

## Threats addressed
| Threat | Control |
|---|---|
| Refresh-token theft from DB | AES-256-GCM at rest, key in env, never logged |
| XSS exfiltrating tokens | JWT stored in `httpOnly` cookies; CSP via Helmet |
| CSRF on state-changing routes | SameSite=Lax cookies + double-submit cookie via `csrf-csrf` |
| Mass scraping / quota burn | `@nestjs/throttler` (100 req/min/IP); per-channel YouTube quota tracking |
| Bad input | Global `ValidationPipe` with `whitelist`, DTO class-validator |
| Plaintext logging of secrets | Pino redact paths for `Authorization`, `cookie`, `*Cipher`, `*Token`, `password*` |
| Replayed refresh tokens | Single-use rotation; revoked rows kept for audit |
| Account hijack via stale sessions | All refresh tokens revoked on logout; expiry enforced server-side |

## Things to do before production
- Run `npm audit` and `npm outdated` regularly.
- Configure a strict `Content-Security-Policy` header in Helmet for production builds.
- Add SSO/2FA via Google Workspace if you offer team accounts.
- Enable Postgres row-level security if you start sharing the DB across tenants.
- Send a Sentry/Datadog alert on `5xx` rate > 1% and on any `UPLOAD_FAILED` notification.
- Verify the Google OAuth consent screen (required for non-test users uploading videos).

## Secret rotation
- Rotate `JWT_SECRET` quarterly. All sessions invalidate (acceptable).
- Rotate `JWT_REFRESH_SECRET` similarly.
- `TOKEN_ENCRYPTION_KEY` is irreversible without a re-encryption migration; rotate only via a planned migration that re-encrypts every `OAuthCredential` row using the `encryptionVersion` field.
