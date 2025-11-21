import { Router } from 'express';
import { listMiddlewares, buildChain } from '../middlewares/registry.js';
import { runChain } from '../composer/composeTimed.js';

type ChainItem = { key: string; options?: Record<string, unknown> };

const router = Router();

function validateChain(chain: any) {
  if (!Array.isArray(chain)) {
    return { valid: false, error: 'chain must be an array' };
  }
  return { valid: true };
}

function generateExportCode(chain: ChainItem[]): string {
  const uniqueKeys = [...new Set(chain.map((c) => c.key))];
  const imports = uniqueKeys.map((k) => `  ${k},`).join('\n');
  const chainItems = chain
    .map((c) => `  ${c.key}(${JSON.stringify(c.options || {})}),`)
    .join('\n');

  return `// Paste into your Express route file
import {
${imports}
} from './middlewares/registryExports'; // adjust import to your project

export const chain = [
${chainItems}
];

// Example usage:
// app.get('/your-route', ...chain, (req, res) => res.json({ ok: true }));
`;
}

router.get('/middlewares', (_req, res) => {
  res.json({ middlewares: listMiddlewares() });
});

router.post('/compose/run', async (req, res) => {
  const { chain = [], payload } = req.body || {};
  const validation = validateChain(chain);

  if (!validation.valid) {
    return res.status(400).json({ err: validation.error });
  }

  try {
    const built = buildChain(chain);
    const result = await runChain({ chain: built, payload });
    res.json(result);
  } catch (e) {
    const error = e as Error;
    res.status(400).json({ err: error?.message || String(e) });
  }
});

router.post('/compose/export', (req, res) => {
  const { chain = [] } = req.body || {};
  const validation = validateChain(chain);

  if (!validation.valid) {
    return res.status(400).json({ err: validation.error });
  }

  const code = generateExportCode(chain as ChainItem[]);
  res.setHeader('content-type', 'text/plain');
  res.send(code);
});

export default router;
