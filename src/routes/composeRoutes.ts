import { Router } from 'express';
import { listMiddlewares, buildChain } from '../middlewares/registry.js';
import { runChain } from '../composer/composeTimed.js';

const router = Router();
router.get('/middlewares', (_req, res) => {
  res.json({ middlewares: listMiddlewares() });
});
router.post('/compose/run', async (req, res) => {
  const { chain = [], payload } = req.body || {};
  try {
    const built = buildChain(chain);
    const result = await runChain({ chain: built, payload });
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ err: e?.message || String(e) });
  }
});
router.post('/compose/export', (req, res) => {
  const { chain = [] } = req.body || {};
  // Produce pasteable TypeScript snippet
  const imports = chain
    .map((c: any) => c.key)
    .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
    .map((k: string) => `  ${k},`)
    .join('\n');

  const arr = chain
    .map((c: any) => `  ${c.key}(${JSON.stringify(c.options || {})}),`)
    .join('\n');

  const code = `// Paste into your Express route file\nimport {\n${imports}\n} from './middlewares/registryExports'; // adjust import to your project\n\nexport const chain = [\n${arr}\n];\n\n// Example usage:\n// app.get('/your-route', ...chain, (req, res) => res.json({ ok: true }));\n`;

  res.setHeader('content-type', 'text/plain');
  res.send(code);
});

export default router;
