export type Req = {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
};

type LocalUser = {
  _id?: string;
  id?: string;
  role?: string;
};

type Locals = Record<string, unknown> & {
  logs?: string[];
  user?: LocalUser;
};

export type Res = {
  locals: Locals;
  statusCode: number;
  headers: Record<string, string>;
  cookies: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }>;
  responded: boolean;
  responseBody?: unknown;
  status: (code: number) => Res;
  json: (data: unknown) => Res;
  send: (data: unknown) => Res;
  setHeader: (name: string, value: string) => void;
  cookie: (name: string, value: string, options?: Record<string, unknown>) => void;
};

export type Next = (err?: unknown) => void;
export type RequestHandlerLike = (req: Req, res: Res, next: Next) => void | Promise<void>;

export type TimelineItem = {
  key: string;
  name: string;
  startedAtMs: number;
  durationMs: number;
  status: 'ok' | 'error' | 'short-circuit' | 'timeout';
  error?: string;
  localsPreview?: Record<string, unknown>;
};

export type RunOptions = {
  chain: Array<{ key: string; name: string; handler: RequestHandlerLike }>;
  payload?: Partial<Req>;
  perStepTimeoutMs?: number;
};

export type RunResult = {
  timeline: TimelineItem[];
  final: {
    statusCode: number;
    headers: Record<string, string>;
    cookies: Array<{
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }>;
    locals: Locals;
    responded: boolean;
    body?: unknown;
  };
};

// Configuration constants
const CONFIG = {
  DEFAULT_STEP_TIMEOUT_MS: 2000,
  DEFAULT_METHOD: 'GET',
  DEFAULT_PATH: '/test',
} as const;

type ResponseCallback = () => void;
type ResponseSnapshot = {
  locals: Locals;
  statusCode: number;
  headers: Record<string, string>;
  cookies: Res['cookies'];
  responded: boolean;
  responseBody?: unknown;
};

function createResponse(onRespond?: ResponseCallback): Res {
  return {
    locals: {},
    statusCode: 200,
    headers: {},
    cookies: [],
    responded: false,
    responseBody: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.responseBody = data;
      this.responded = true;
      this.setHeader('content-type', 'application/json');
      onRespond?.();
      return this;
    },
    send(data: unknown) {
      this.responseBody = data;
      this.responded = true;
      onRespond?.();
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = String(value);
    },
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      this.cookies.push({ name, value, options });
    },
  };
}

function createScopedResponse(base: Res, token: symbol, isActive: (token: symbol) => boolean): Res {
  const allow = () => isActive(token);
  const guardedLocals = new Proxy(base.locals, {
    get(target, prop) {
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      if (!allow()) return true;
      return Reflect.set(target, prop, value);
    },
    deleteProperty(target, prop) {
      if (!allow()) return false;
      return Reflect.deleteProperty(target, prop);
    },
  });

  const scoped: Res = {
    get locals() {
      return guardedLocals;
    },
    set locals(value: Locals) {
      if (allow()) base.locals = value;
    },
    get statusCode() {
      return base.statusCode;
    },
    set statusCode(code: number) {
      if (allow()) base.statusCode = code;
    },
    get headers() {
      return base.headers;
    },
    set headers(value: Record<string, string>) {
      if (allow()) base.headers = value;
    },
    get cookies() {
      return base.cookies;
    },
    set cookies(value: Res['cookies']) {
      if (allow()) base.cookies = value;
    },
    get responded() {
      return base.responded;
    },
    set responded(value: boolean) {
      if (allow()) base.responded = value;
    },
    get responseBody() {
      return base.responseBody;
    },
    set responseBody(value: unknown) {
      if (allow()) base.responseBody = value;
    },
    status(code: number) {
      if (!allow()) return this;
      base.status(code);
      return this;
    },
    json(data: unknown) {
      if (!allow()) return this;
      base.json(data);
      return this;
    },
    send(data: unknown) {
      if (!allow()) return this;
      base.send(data);
      return this;
    },
    setHeader(name: string, value: string) {
      if (!allow()) return;
      base.setHeader(name, value);
    },
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      if (!allow()) return;
      base.cookie(name, value, options);
    },
  };

  return scoped;
}

function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return 'Error';
}

export async function runChain({
  chain,
  payload,
  perStepTimeoutMs = CONFIG.DEFAULT_STEP_TIMEOUT_MS,
}: RunOptions): Promise<RunResult> {
  let activeStepToken: symbol | null = null;
  const req: Req = {
    method: payload?.method ?? CONFIG.DEFAULT_METHOD,
    path: payload?.path ?? CONFIG.DEFAULT_PATH,
    headers: Object.fromEntries(
      Object.entries(payload?.headers ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        String(v),
      ])
    ),
    query: payload?.query ?? {},
    body: payload?.body ?? null,
  };

  const timeline: TimelineItem[] = [];

  // Mutable callback reference that gets updated each step
  // This replaces inefficient polling (setInterval) with event-driven resolution
  let onRespondCallback: ResponseCallback | undefined;
  const resState = createResponse(() => onRespondCallback?.());

  for (const step of chain) {
    const stepToken = Symbol('step');
    const scopedRes = createScopedResponse(
      resState,
      stepToken,
      (token) => activeStepToken === token
    );
    activeStepToken = stepToken;
    const startedAt = Date.now();
    let status: TimelineItem['status'] = 'ok';
    let errorMsg: string | undefined;
    const beforeStep = snapshotResponse(resState);
    let timedOut = false;

    await new Promise<void>((resolve) => {
      let resolved = false;
      let nextCalled = false;

      // Safe resolve to prevent double-resolution race condition
      const safeResolve = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        onRespondCallback = undefined;
        resolve();
      };

      // Set callback for when middleware responds without calling next
      onRespondCallback = safeResolve;

      const timer = setTimeout(() => {
        if (!resolved) {
          timedOut = true;
          status = 'timeout';
          safeResolve();
        }
      }, perStepTimeoutMs);

      const next: Next = (err?: unknown) => {
        if (nextCalled) return;
        nextCalled = true;
        if (err) {
          status = 'error';
          errorMsg = getErrorMessage(err);
        }
        safeResolve();
      };

      // Execute the middleware
      try {
        const maybe = step.handler(req, scopedRes, next);
        if (maybe instanceof Promise) {
          maybe.catch((e: unknown) => {
            status = 'error';
            errorMsg = getErrorMessage(e);
            safeResolve();
          });
        }
      } catch (e: unknown) {
        status = 'error';
        errorMsg = getErrorMessage(e);
        safeResolve();
      }
    });
    activeStepToken = null;
    const durationMs = Math.max(0, Date.now() - startedAt);

    // Determine final status - if response was sent without error/timeout, it's a short-circuit
    const finalStatus: TimelineItem['status'] =
      resState.responded && status === 'ok' ? 'short-circuit' : status;

    if (timedOut) {
      restoreResponse(resState, beforeStep);
    }

    timeline.push({
      key: step.key,
      name: step.name,
      startedAtMs: startedAt,
      durationMs,
      status: finalStatus,
      error: errorMsg,
      localsPreview: shallowPreview(resState.locals),
    });

    // Stop execution on error, timeout, or short-circuit
    if (finalStatus !== 'ok') {
      break;
    }
  }

  return {
    timeline,
    final: {
      statusCode: resState.statusCode,
      headers: resState.headers,
      cookies: resState.cookies,
      locals: resState.locals,
      responded: resState.responded,
      body: resState.responseBody,
    },
  };
}
function shallowPreview(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] =
      typeof v === 'object' && v !== null
        ? Array.isArray(v)
          ? `[Array(${v.length})]`
          : '{...}'
        : v;
  }
  return out;
}

function snapshotResponse(res: Res): ResponseSnapshot {
  return {
    locals: structuredClone(res.locals),
    statusCode: res.statusCode,
    headers: { ...res.headers },
    cookies: res.cookies.map((c) => ({
      ...c,
      options: c.options ? { ...c.options } : undefined,
    })),
    responded: res.responded,
    responseBody: res.responseBody,
  };
}

function restoreResponse(res: Res, snapshot: ResponseSnapshot) {
  res.locals = snapshot.locals;
  res.statusCode = snapshot.statusCode;
  res.headers = snapshot.headers;
  res.cookies = snapshot.cookies;
  res.responded = snapshot.responded;
  res.responseBody = snapshot.responseBody;
}
