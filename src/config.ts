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

function parseTrustProxy(value: string | undefined): boolean | string | number {
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true') return true;
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) return num;
  return value;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
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
  rateLimitEnabled: parseBool(process.env.RATE_LIMIT_ENABLED as Bool, true),
  logRequests: parseBool(process.env.LOG_REQUESTS as Bool, false),
  csrfSecureCookie: parseBool(
    process.env.CSRF_SECURE_COOKIE as Bool,
    NODE_ENV === 'production'
  ),
  csrfSecret,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  maxBodySerializedLength: parseNumber(
    process.env.MAX_BODY_SERIALIZED_LENGTH,
    50_000
  ),
};
