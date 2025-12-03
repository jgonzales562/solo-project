import { Router } from 'express';
import { listMiddlewares, buildChain } from '../middlewares/registry.js';
import { runChain } from '../composer/composeTimed.js';

type ChainItem = { key: string; options?: Record<string, unknown> };

const router = Router();

const MAX_CHAIN_LENGTH = 50;
const MAX_PAYLOAD_KEYS = 100;
const MAX_STRING_LENGTH = 10000;
const MAX_HEADER_VALUE_LENGTH = 1000;
const MAX_BODY_KEYS = 100;
const MAX_BODY_STRING_LENGTH = 10000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateChain(chain: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(chain)) {
    return { valid: false, error: 'chain must be an array' };
  }

  if (chain.length > MAX_CHAIN_LENGTH) {
    return { valid: false, error: `chain exceeds maximum length of ${MAX_CHAIN_LENGTH}` };
  }

  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    if (!isPlainObject(item)) {
      return { valid: false, error: `chain[${i}] must be an object` };
    }
    if (typeof item.key !== 'string' || item.key.length === 0) {
      return { valid: false, error: `chain[${i}].key must be a non-empty string` };
    }
    if (item.options !== undefined && !isPlainObject(item.options)) {
      return { valid: false, error: `chain[${i}].options must be an object if provided` };
    }
  }

  return { valid: true };
}

function validatePayload(payload: unknown): { valid: boolean; error?: string } {
  if (payload === undefined || payload === null) {
    return { valid: true }; // payload is optional
  }

  if (!isPlainObject(payload)) {
    return { valid: false, error: 'payload must be an object' };
  }

  if (payload.method !== undefined && typeof payload.method !== 'string') {
    return { valid: false, error: 'payload.method must be a string' };
  }

  if (payload.path !== undefined && typeof payload.path !== 'string') {
    return { valid: false, error: 'payload.path must be a string' };
  }

  if (payload.path && payload.path.length > MAX_STRING_LENGTH) {
    return { valid: false, error: `payload.path exceeds maximum length of ${MAX_STRING_LENGTH}` };
  }

  if (payload.headers !== undefined) {
    if (!isPlainObject(payload.headers)) {
      return { valid: false, error: 'payload.headers must be an object' };
    }
    if (Object.keys(payload.headers).length > MAX_PAYLOAD_KEYS) {
      return { valid: false, error: `payload.headers exceeds maximum of ${MAX_PAYLOAD_KEYS} keys` };
    }
    for (const [name, value] of Object.entries(payload.headers)) {
      const valueStr = String(value);
      if (valueStr.length > MAX_HEADER_VALUE_LENGTH) {
        return {
          valid: false,
          error: `payload.headers["${name}"] exceeds maximum length of ${MAX_HEADER_VALUE_LENGTH}`,
        };
      }
    }
  }

  if (payload.query !== undefined) {
    if (!isPlainObject(payload.query)) {
      return { valid: false, error: 'payload.query must be an object' };
    }
    if (Object.keys(payload.query).length > MAX_PAYLOAD_KEYS) {
      return { valid: false, error: `payload.query exceeds maximum of ${MAX_PAYLOAD_KEYS} keys` };
    }
  }

  if (payload.body !== undefined && payload.body !== null) {
    if (!isPlainObject(payload.body)) {
      return { valid: false, error: 'payload.body must be an object' };
    }
    if (Object.keys(payload.body).length > MAX_BODY_KEYS) {
      return { valid: false, error: `payload.body exceeds maximum of ${MAX_BODY_KEYS} keys` };
    }
    for (const [name, value] of Object.entries(payload.body)) {
      if (typeof value === 'string' && value.length > MAX_BODY_STRING_LENGTH) {
        return {
          valid: false,
          error: `payload.body["${name}"] exceeds maximum length of ${MAX_BODY_STRING_LENGTH}`,
        };
      }
    }
  }

  return { valid: true };
}

function generateExportCode(chain: ChainItem[]): string {
  const chainItems = chain
    .map(
      (c) => `  middlewareExports.${c.key}(${JSON.stringify(c.options || {})}),`
    )
    .join('\n');

  return `// Paste into your Express route file
import { middlewareExports } from './middlewares/registryExports'; // adjust import to your project

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

  const chainValidation = validateChain(chain);
  if (!chainValidation.valid) {
    return res.status(400).json({ err: chainValidation.error });
  }

  const payloadValidation = validatePayload(payload);
  if (!payloadValidation.valid) {
    return res.status(400).json({ err: payloadValidation.error });
  }

  try {
    const built = buildChain(chain as ChainItem[]);
    const result = await runChain({ chain: built, payload });
    res.json(result);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    res.status(400).json({ err: error.message });
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
