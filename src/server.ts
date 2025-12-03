import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import composeRoutes from './routes/composeRoutes.js';

const DEFAULT_PORT = 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Security: Limit request body size
app.use(express.json({ limit: '1mb' }));

// Security headers (modern defaults + CSP tuned for this app)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // inline styles in index.html
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
