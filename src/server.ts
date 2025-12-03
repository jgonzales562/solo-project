import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import composeRoutes from './routes/composeRoutes.js';

const DEFAULT_PORT = 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const REQUEST_BODY_LIMIT_BYTES =
  Number(process.env.REQUEST_BODY_LIMIT_BYTES) || 1_000_000;
const REQUEST_BODY_LIMIT = `${REQUEST_BODY_LIMIT_BYTES}b`;

// Security: Limit request body size (kept in sync with validation)
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

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
  })
);

// API
app.use('/api', composeRoutes);

// Static client
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

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
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(status).json({ error: message });
  }
);

const PORT = process.env.PORT || DEFAULT_PORT;
app.listen(PORT, () => {
  console.log(`Middleware Composer listening on http://localhost:${PORT}`);
});
