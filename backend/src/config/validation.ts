// Minimal runtime check. Throws on boot if any required env is missing.
const REQUIRED = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'TOKEN_ENCRYPTION_KEY',
  'OPENAI_API_KEY',
  'FRONTEND_ORIGIN',
] as const;

export function assertEnv(): void {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  if ((process.env.TOKEN_ENCRYPTION_KEY ?? '').length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars).');
  }
}

export const configValidationSchema = undefined;
