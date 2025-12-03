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
describe('POST /api/compose/run', () => {
    it('rejects non-array chain', async () => {
        const app = createApp();
        const res = await request(app).post('/api/compose/run').send({ chain: {} });
        expect(res.status).toBe(400);
        expect(res.body.err).toMatch(/chain must be an array/i);
    });
    it('runs a simple chain and returns timeline/final', async () => {
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
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.timeline)).toBe(true);
        expect(res.body.timeline[0].status).toBe('ok');
        expect(res.body.timeline[1].status).toBe('short-circuit');
        expect(res.body.final.statusCode).toBe(201);
        expect(res.body.final.body).toEqual({ ok: true });
    });
});
describe('POST /api/compose/export', () => {
    it('rejects invalid chain', async () => {
        const app = createApp();
        const res = await request(app)
            .post('/api/compose/export')
            .send({ chain: [{ key: '' }] });
        expect(res.status).toBe(400);
        expect(res.body.err).toMatch(/chain\[0\]\.key/i);
    });
});
