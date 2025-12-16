import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import composeRoutes from '../src/routes/composeRoutes.js';
import { createCsrfProtection, issueCsrfCookie } from '../src/server.js';
import { runChain } from '../src/composer/composeTimed.js';

// Build a lightweight app using the router
function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', composeRoutes);
  return app;
}

function createAppWithCsrf() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.get('/api/csrf', (_req, res) => {
    try {
      const token = issueCsrfCookie(res);
      res.json({ token });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to issue CSRF token';
      res.status(500).json({ error: { message } });
    }
  });
  app.post('/api/protected', createCsrfProtection(), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

test('POST /api/compose/run rejects non-array chain', async () => {
  const app = createApp();
  const res = await request(app).post('/api/compose/run').send({ chain: {} });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_chain');
  assert.match(res.body.error.message, /chain must be an array/i);
});

test('POST /api/compose/run rejects overly long chain', async () => {
  const app = createApp();
  const longChain = Array.from({ length: 51 }, () => ({ key: 'logger' }));
  const res = await request(app)
    .post('/api/compose/run')
    .send({ chain: longChain });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_chain');
});

test('POST /api/compose/run executes and returns timeline/final', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/run')
    .send({
      chain: [
        { key: 'logger' },
        { key: 'respond', options: { status: 201, body: { ok: true } } },
      ],
      payload: { method: 'GET', path: '/test' },
    });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.timeline));
  assert.equal(res.body.timeline[0].status, 'ok');
  assert.equal(res.body.timeline[1].status, 'short-circuit');
  assert.equal(res.body.final.statusCode, 201);
  assert.deepEqual(res.body.final.body, { ok: true });
});

test('GET unknown /api route returns JSON 404', async () => {
  const app = createApp();
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'not_found');
  assert.match(res.body.error.message, /route not found/i);
});

test('GET /api/csrf issues token usable for protected POST', async () => {
  const app = createAppWithCsrf();
  const agent = request.agent(app);

  const csrfRes = await agent.get('/api/csrf');
  assert.equal(csrfRes.status, 200);
  const token = csrfRes.body?.token;
  assert.equal(typeof token, 'string');

  const postRes = await agent
    .post('/api/protected')
    .set('x-csrf-token', token as string)
    .send({ hello: 'world' });

  assert.equal(postRes.status, 200);
  assert.equal(postRes.body.ok, true);
});

test('POST /api/compose/export rejects invalid chain', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/export')
    .send({ chain: [{ key: '' }] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_chain');
  assert.match(res.body.error.message, /chain\[0\]\.key/i);
});

test('POST /api/compose/run rejects unknown middleware key', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/run')
    .send({
      chain: [{ key: 'unknown-mw' }],
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_chain');
  assert.match(res.body.error.message, /known middleware/i);
});

test('POST /api/compose/run rejects invalid perStepTimeout', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/run')
    .send({
      chain: [{ key: 'logger' }],
      perStepTimeoutMs: -5,
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_timeout');
});

test('POST /api/compose/run rejects perStepTimeout above max', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/run')
    .send({
      chain: [{ key: 'logger' }],
      perStepTimeoutMs: 20000,
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_timeout');
});

test('GET /api/telemetry reflects runs', async () => {
  const app = createApp();
  const agent = request(app);

  const before = await agent.get('/api/telemetry');
  assert.equal(before.status, 200);
  const prevRuns = Number(before.body.totalRuns || 0);

  await agent.post('/api/compose/run').send({
    chain: [
      { key: 'logger' },
      { key: 'respond', options: { status: 204, body: { ok: true } } },
    ],
  });

  const after = await agent.get('/api/telemetry');
  assert.equal(after.status, 200);
  assert.equal(after.body.totalRuns, prevRuns + 1);
  assert.ok(after.body.middlewares.respond?.count >= 1);
});

test('POST /api/compose/run rejects non-object options', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/run')
    .send({
      chain: [{ key: 'logger', options: [] }],
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_chain');
});

test('POST /api/compose/export returns code for valid chain', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/export')
    .send({ chain: [{ key: 'respond', options: { status: 204 } }] });
  assert.equal(res.status, 200);
  assert.match(res.text, /middlewareExports\.respond/);
});

test('POST /api/compose/run rejects invalid payload headers', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/run')
    .send({
      chain: [{ key: 'logger' }],
      payload: { headers: 'not-an-object' },
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_payload');
});

test('runChain ignores late mutations from prior steps', async () => {
  const result = await runChain({
    chain: [
      {
        key: 'late',
        name: 'Late',
        handler: (_req, res, next) => {
          next();
          setTimeout(() => {
            res.status(500);
            res.setHeader('x-late', '1');
            res.locals.after = true;
          }, 20);
        },
      },
      {
        key: 'next',
        name: 'Next',
        handler: (_req, res, next) => {
          res.setHeader('x-good', 'yes');
          next();
        },
      },
    ],
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(result.final.statusCode, 200);
  assert.equal(result.final.headers['x-good'], 'yes');
  assert.equal(result.final.headers['x-late'], undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.final.locals, 'after'),
    false
  );
});
