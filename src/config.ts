function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  const cleaned = normalized.replace(/_/g, '').replace(/,/g, '');
  const num = Number(cleaned);
  if (Number.isFinite(num) && num >= 0) return num;
  return fallback;
}

function parseTrustProxy(value: string | undefined): boolean | string | number {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true') return true;
  const cleaned = normalized.replace(/_/g, '').replace(/,/g, '');
  const num = Number(cleaned);
  if (Number.isFinite(num) && num >= 0) return num;
  return normalized;
}

const NODE_ENV = (process.env.NODE_ENV || 'development').trim().toLowerCase();
const REQUIRED_ENV_IN_PROD = ['CSRF_SECRET'] as const;
const DEV_CSRF_SECRET_FALLBACK = 'dev-only-csrf-secret-change-me';

if (NODE_ENV === 'production') {
  const missing = REQUIRED_ENV_IN_PROD.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars in production: ${missing.join(', ')}`
    );
  }
}

let csrfSecret = process.env.CSRF_SECRET;
if (!csrfSecret) {
  if (NODE_ENV === 'development') {
    console.warn(
      'Using development CSRF secret fallback; set CSRF_SECRET for any real deployment.'
    );
    csrfSecret = DEV_CSRF_SECRET_FALLBACK;
  } else {
    throw new Error('CSRF_SECRET is required when NODE_ENV is not development');
  }
}

export const config = {
  nodeEnv: NODE_ENV,
  port: parseNumber(process.env.PORT, 3000),
  requestBodyLimitBytes: parseNumber(
    process.env.REQUEST_BODY_LIMIT_BYTES,
    1_000_000
  ),
  rateLimitEnabled: parseBool(process.env.RATE_LIMIT_ENABLED, true),
  logRequests: parseBool(process.env.LOG_REQUESTS, false),
  csrfSecureCookie: parseBool(
    process.env.CSRF_SECURE_COOKIE,
    NODE_ENV === 'production'
  ),
  csrfSecret,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  maxBodySerializedLength: parseNumber(
    process.env.MAX_BODY_SERIALIZED_LENGTH,
    50_000
  ),
};
