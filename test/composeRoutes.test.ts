import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import request from 'supertest';
import express from 'express';
import composeRoutes from '../src/routes/composeRoutes.js';

// Build a lightweight app using the router
function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', composeRoutes);
  return app;
}

async function canBindPort(): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(0, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}

const canBind = await canBindPort();

test('POST /api/compose/run rejects non-array chain', { skip: !canBind }, async () => {
  const app = createApp();
  const res = await request(app).post('/api/compose/run').send({ chain: {} });
  assert.equal(res.status, 400);
  assert.match(res.body.err, /chain must be an array/i);
});

test('POST /api/compose/run executes and returns timeline/final', { skip: !canBind }, async () => {
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

test('POST /api/compose/export rejects invalid chain', { skip: !canBind }, async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/compose/export')
    .send({ chain: [{ key: '' }] });
  assert.equal(res.status, 400);
  assert.match(res.body.err, /chain\[0\]\.key/i);
});
