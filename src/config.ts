type Bool = 'true' | 'false' | undefined;

function parseBool(value: Bool, fallback: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  return fallback;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const REQUIRED_ENV_IN_PROD = ['PORT', 'CSRF_SECRET'] as const;

if (NODE_ENV === 'production') {
  const missing = REQUIRED_ENV_IN_PROD.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars in production: ${missing.join(', ')}`);
  }
}

export const config = {
  nodeEnv: NODE_ENV,
  port: parseNumber(process.env.PORT, 3000),
  requestBodyLimitBytes: parseNumber(process.env.REQUEST_BODY_LIMIT_BYTES, 1_000_000),
  rateLimitEnabled: parseBool(process.env.RATE_LIMIT_ENABLED as Bool, true),
  logRequests: parseBool(process.env.LOG_REQUESTS as Bool, false),
  csrfSecureCookie:
    parseBool(process.env.CSRF_SECURE_COOKIE as Bool, NODE_ENV === 'production'),
  csrfSecret:
    process.env.CSRF_SECRET ||
    (NODE_ENV === 'production' ? null : 'dev-only-csrf-secret-change-me'),
};
