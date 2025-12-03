import type { Req, RequestHandlerLike } from '../composer/composeTimed.js';

export type MiddlewareMeta = {
  key: string;
  name: string;
  description: string;
  defaults?: Record<string, unknown>;
  factory: (options?: Record<string, unknown>) => RequestHandlerLike;
};

// Helper: get header value (case-insensitive)
const getHeader = (req: Req, name: unknown): string | undefined =>
  req.headers[String(name).toLowerCase()];

// Helper: sleep
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const registry: readonly MiddlewareMeta[] = Object.freeze([
  {
    key: 'logger',
    name: 'Logger',
    description: 'Logs method, path, and a timestamp into res.locals.logs.',
    factory: () => (req, res, next) => {
      const line = `${new Date().toISOString()} ${req.method} ${req.path}`;
      const existingLogs = Array.isArray(res.locals.logs)
        ? res.locals.logs
        : [];
      res.locals.logs = [...existingLogs, line];
      next();
    },
  },
  {
    key: 'delay',
    name: 'Delay',
    description: 'Waits N ms.',
    defaults: { ms: 200 },
    factory:
      ({ ms = 200 } = {}) =>
      async (_req, _res, next) => {
        await sleep(Number(ms));
        next();
      },
  },
  {
    key: 'setHeader',
    name: 'Set Header',
    description: 'Sets a response header.',
    defaults: { name: 'x-demo', value: '42' },
    factory:
      ({ name = 'x-demo', value = '42' } = {}) =>
      (_req, res, next) => {
        res.setHeader(String(name), String(value));
        next();
      },
  },
  {
    key: 'setCookie',
    name: 'Set Cookie',
    description: 'Sets a cookie (optionally HttpOnly).',
    defaults: { name: 'ssid', value: 'abc123', httpOnly: true },
    factory:
      ({ name = 'ssid', value = 'abc123', httpOnly = true } = {}) =>
      (_req, res, next) => {
        res.cookie(String(name), String(value), {
          httpOnly: Boolean(httpOnly),
        });
        next();
      },
  },
  {
    key: 'authRequired',
    name: 'Auth Required',
    description: 'Checks a header for a token; 401 if missing/invalid.',
    defaults: { header: 'x-auth', token: 'secret' },
    factory:
      ({ header = 'x-auth', token = 'secret' } = {}) =>
      (req, res, next) => {
        const got = getHeader(req, header);
        if (got !== String(token)) {
          res.status(401).json({ err: 'Unauthorized' });
          return; // short-circuit
        }
        next();
      },
  },
  {
    key: 'attachUser',
    name: 'Attach User From Header',
    description:
      'Reads x-user header and puts a fake user object on res.locals.',
    defaults: { header: 'x-user', defaultRole: 'viewer' },
    factory:
      ({ header = 'x-user', defaultRole = 'viewer' }: { header?: unknown; defaultRole?: string } = {}) =>
      (req, res, next) => {
        const id = getHeader(req, header);
        if (id) {
          res.locals.user = {
            _id: id,
            id,
            role: defaultRole ?? 'viewer',
          };
        }
        next();
      },
  },
  {
    key: 'respond',
    name: 'Respond',
    description:
      'Sends a JSON response and ends the chain unless next() is called.',
    defaults: { status: 200, body: { ok: true } },
    factory:
      ({ status = 200, body = { ok: true } } = {}) =>
      (_req, res, _next) => {
        res.status(Number(status)).json(body);
        // intentionally not calling next() here to short-circuit
      },
  },
  {
    key: 'throwError',
    name: 'Throw Error',
    description: 'Throws an error to test error handling.',
    defaults: { message: 'Boom' },
    factory:
      ({ message = 'Boom' } = {}) =>
      (_req, _res, _next) => {
        throw new Error(String(message));
      },
  },
  {
    key: 'ssidCookie',
    name: 'Set SSID Cookie (HttpOnly)',
    description:
      'Calls cookieController.setSSIDCookie; gets user id from header or res.locals.user.',
    defaults: { header: 'x-user-id' },
    factory:
      ({ header = 'x-user-id' } = {}) =>
      (req, res, next) => {
        // If your real controller expects res.locals.user._id, provide it from a header when running the mock
        const idFromHeader = getHeader(req, header);
        if (idFromHeader && !res.locals.user)
          res.locals.user = { _id: idFromHeader };

        // Replicate cookieController.setSSIDCookie logic directly to avoid type mismatch
        // This keeps the mock system self-contained without requiring Express type casting
        const userId = res.locals?.user?._id;
        if (!userId) {
          return next(new Error('Missing user id'));
        }
        res.cookie('ssid', String(userId), { httpOnly: true });
        return next();
      },
  },
]);
export function listMiddlewares() {
  return registry.map(({ key, name, description, defaults }) => ({
    key,
    name,
    description,
    defaults,
  }));
}

function findMiddleware(key: string) {
  const meta = registry.find((m) => m.key === key);
  if (!meta) throw new Error(`Unknown middleware: ${key}`);
  return meta;
}

export function buildChain(
  items: Array<{ key: string; options?: Record<string, unknown> }>
) {
  return items.map(({ key, options }) => {
    const meta = findMiddleware(key);
    return { key: meta.key, name: meta.name, handler: meta.factory(options) };
  });
}
