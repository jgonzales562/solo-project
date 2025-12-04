import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import composeRoutes from './routes/composeRoutes.js';

const DEFAULT_PORT = 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Honor X-Forwarded-* headers when behind proxies/load balancers (needed for rate limiting & CSRF)
app.set('trust proxy', 1);

const REQUEST_BODY_LIMIT_BYTES =
  Number(process.env.REQUEST_BODY_LIMIT_BYTES) || 1_000_000;
const REQUEST_BODY_LIMIT = `${REQUEST_BODY_LIMIT_BYTES}b`;
const LOG_REQUESTS = process.env.LOG_REQUESTS === 'true';
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';
const NODE_ENV = process.env.NODE_ENV || 'development';
const CSRF_SECURE_COOKIE =
  process.env.CSRF_SECURE_COOKIE === 'true' ||
  (process.env.CSRF_SECURE_COOKIE === undefined && NODE_ENV === 'production');
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

// Security: Limit request body size (kept in sync with validation)
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(cookieParser());

// Health endpoint (lightweight)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Readiness endpoint (checks middleware registry is available)
app.get('/ready', (_req, res) => {
  try {
    if (!composeRoutes) throw new Error('router not initialized');
    res.json({ status: 'ready' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'not ready';
    res.status(503).json({ status: 'not-ready', error: message });
  }
});

// Optional request logging
if (LOG_REQUESTS) {
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const logLine = {
        ts: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        ua: req.headers['user-agent'],
      };
      console.log(JSON.stringify(logLine));
    });
    next();
  });
}

// Security headers (modern defaults + CSP tuned for this app)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: true,
  })
);

// Compression for API + static assets
app.use(
  compression({
    threshold: 1024,
  })
);

// Rate limiting for API routes
if (RATE_LIMIT_ENABLED) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function issueCsrfCookie(res: express.Response) {
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: CSRF_SECURE_COOKIE,
    maxAge: 1000 * 60 * 60 * 2, // 2 hours
  });
  return token;
}

function createCsrfProtection() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const method = req.method.toUpperCase();
    const isSafe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'TRACE';

    let cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    if (!cookieToken) {
      cookieToken = issueCsrfCookie(res);
      if (isSafe) return next();
    }

    if (isSafe) return next();

    const headerToken =
      req.get(CSRF_HEADER_NAME) ||
      (typeof req.body === 'object' && req.body !== null ? (req.body as { _csrf?: string })._csrf : undefined);

    if (!headerToken || headerToken !== cookieToken) {
      return res
        .status(403)
        .json({ error: { code: 'csrf_invalid', message: 'Invalid CSRF token' } });
    }

    return next();
  };
}

const csrfProtection = createCsrfProtection();

// CSRF token endpoint
app.get('/api/csrf', (req, res) => {
  const token = issueCsrfCookie(res);
  res.json({ token });
});

// API
app.use('/api', csrfProtection, composeRoutes);

// Static client
const clientPath = path.join(__dirname, '..', 'client');
app.use(
  express.static(clientPath, {
    etag: true,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })
);

// 404 for non-file routes → serve index.html so the page loads
app.use((_req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Error handling middleware
app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Error:', err);
    if ((err as { code?: string }).code === 'EBADCSRFTOKEN') {
      return res.status(403).json({ error: { code: 'csrf_invalid', message: 'Invalid CSRF token' } });
    }
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(status).json({ error: { code: 'server_error', message } });
  }
);

const PORT = process.env.PORT || DEFAULT_PORT;
app.listen(PORT, () => {
  console.log(`Middleware Composer listening on http://localhost:${PORT}`);
});
