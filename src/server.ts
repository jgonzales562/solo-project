import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import composeRoutes from './routes/composeRoutes.js';
import { config } from './config.js';

const DEFAULT_PORT = 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
// Honor X-Forwarded-* headers when behind proxies/load balancers (needed for rate limiting & CSRF)
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

const REQUEST_BODY_LIMIT_BYTES = config.requestBodyLimitBytes;
const REQUEST_BODY_LIMIT = `${REQUEST_BODY_LIMIT_BYTES}b`;
const LOG_REQUESTS = config.logRequests;
const RATE_LIMIT_ENABLED = config.rateLimitEnabled;
const CSRF_SECURE_COOKIE = config.csrfSecureCookie;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_SECRET = config.csrfSecret;

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
        styleSrc: ["'self'"],
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

function signToken(token: string) {
  return `${token}.${crypto.createHmac('sha256', CSRF_SECRET).update(token).digest('hex')}`;
}

function timingSafeEquals(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifySignature(value: string | undefined) {
  if (!value) return undefined;
  const parts = value.split('.');
  if (parts.length !== 2) return undefined;
  const [token, sig] = parts;
  const expected = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(token)
    .digest('hex');
  return timingSafeEquals(sig, expected) ? token : undefined;
}

function issueCsrfCookie(res: express.Response) {
  if (!CSRF_SECRET) {
    throw new Error('CSRF_SECRET is required in production');
  }
  const token = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, signToken(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: CSRF_SECURE_COOKIE,
    maxAge: 1000 * 60 * 60 * 2, // 2 hours
  });
  return token;
}

function createCsrfProtection() {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!CSRF_SECRET) {
      const msg = 'CSRF_SECRET is required in production';
      console.error(msg);
      return res
        .status(500)
        .json({ error: { code: 'csrf_config', message: msg } });
    }
    const method = req.method.toUpperCase();
    const isSafe =
      method === 'GET' ||
      method === 'HEAD' ||
      method === 'OPTIONS' ||
      method === 'TRACE';

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    let verifiedToken = verifySignature(cookieToken);
    if (!verifiedToken) {
      verifiedToken = issueCsrfCookie(res);
      if (isSafe) return next();
    }

    if (isSafe) return next();

    const headerToken =
      req.get(CSRF_HEADER_NAME) ||
      (typeof req.body === 'object' && req.body !== null
        ? (req.body as { _csrf?: string })._csrf
        : undefined);

    if (!headerToken || headerToken !== verifiedToken) {
      return res.status(403).json({
        error: { code: 'csrf_invalid', message: 'Invalid CSRF token' },
      });
    }

    return next();
  };
}

const csrfProtection = createCsrfProtection();

// CSRF token endpoint
app.get('/api/csrf', (_req, res) => {
  try {
    const token = issueCsrfCookie(res);
    res.json({ token });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to issue CSRF token';
    res.status(500).json({ error: { code: 'csrf_config', message } });
  }
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
      return res.status(403).json({
        error: { code: 'csrf_invalid', message: 'Invalid CSRF token' },
      });
    }
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(status).json({ error: { code: 'server_error', message } });
  }
);

const PORT = config.port || DEFAULT_PORT;
const invokedFromCli = process.argv.some(
  (arg) => arg.endsWith('server.ts') || arg.endsWith('server.js')
);
const shouldListen = process.env.START_SERVER !== 'false' && invokedFromCli;
let server: ReturnType<typeof app.listen> | undefined;

if (shouldListen) {
  server = app.listen(PORT, () => {
    console.log(`Middleware Composer listening on http://localhost:${PORT}`);
  });

  function gracefulShutdown(signal: string) {
    if (!server) {
      process.exit(0);
    }
    console.log(`Received ${signal}, shutting down...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    // Force exit if close hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export { app, createCsrfProtection, issueCsrfCookie };
