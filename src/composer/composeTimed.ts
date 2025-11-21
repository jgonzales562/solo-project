export type Req = {
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
};

export type Res = {
  locals: Record<string, any>;
  statusCode: number;
  headers: Record<string, string>;
  cookies: Array<{
    name: string;
    value: string;
    options?: Record<string, any>;
  }>;
  responded: boolean;
  responseBody?: any;
  status: (code: number) => Res;
  json: (data: any) => Res;
  send: (data: any) => Res;
  setHeader: (name: string, value: string) => void;
  cookie: (name: string, value: string, options?: Record<string, any>) => void;
};

export type Next = (err?: any) => void;
export type RequestHandlerLike = (req: Req, res: Res, next: Next) => any;

export type TimelineItem = {
  key: string;
  name: string;
  startedAtMs: number;
  durationMs: number;
  status: 'ok' | 'error' | 'short-circuit' | 'timeout';
  error?: string;
  localsPreview?: Record<string, any>;
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
      options?: Record<string, any>;
    }>;
    locals: Record<string, any>;
    responded: boolean;
    body?: any;
  };
};

function createResponse(): Res {
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
    json(data: any) {
      this.responseBody = data;
      this.responded = true;
      this.setHeader('content-type', 'application/json');
      return this;
    },
    send(data: any) {
      this.responseBody = data;
      this.responded = true;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = String(value);
    },
    cookie(name: string, value: string, options?: Record<string, any>) {
      this.cookies.push({ name, value, options });
    },
  };
}

function getErrorMessage(err: any): string {
  return typeof err === 'string' ? err : err?.message || 'Error';
}

const CHECK_INTERVAL_MS = 10;

export async function runChain({
  chain,
  payload,
  perStepTimeoutMs = 2000,
}: RunOptions): Promise<RunResult> {
  const req: Req = {
    method: payload?.method || 'GET',
    path: payload?.path || '/test',
    headers: Object.fromEntries(
      Object.entries(payload?.headers || {}).map(([k, v]) => [
        k.toLowerCase(),
        String(v),
      ])
    ),
    query: payload?.query || {},
    body: payload?.body ?? null,
  };

  const res = createResponse();
  const timeline: TimelineItem[] = [];

  for (const step of chain) {
    const startedAt = Date.now();
    let ended = false;
    let status: TimelineItem['status'] = 'ok';
    let errorMsg: string | undefined;

    await new Promise<void>(async (resolve) => {
      let nextCalled = false;
      const timer = setTimeout(() => {
        if (!ended) {
          status = 'timeout';
          ended = true;
          resolve();
        }
      }, perStepTimeoutMs);
      const next: Next = (err?: any) => {
        nextCalled = true;
        if (err) {
          status = 'error';
          errorMsg = getErrorMessage(err);
        }
        clearTimeout(timer);
        ended = true;
        resolve();
      };
      try {
        const maybe = step.handler(req, res, next);
        if (maybe instanceof Promise) {
          await maybe.catch((e: any) => {
            status = 'error';
            errorMsg = getErrorMessage(e);
          });
        }
      } catch (e: any) {
        status = 'error';
        errorMsg = getErrorMessage(e);
        clearTimeout(timer);
        ended = true;
        return resolve();
      }
      // If middleware neither called next nor responded, we wait until timeout.
      const checkInterval = setInterval(() => {
        if (nextCalled || res.responded) {
          clearInterval(checkInterval);
          clearTimeout(timer);
          ended = true;
          resolve();
        }
      }, CHECK_INTERVAL_MS);
    });
    const durationMs = Math.max(0, Date.now() - startedAt);

    // Determine final status - if response was sent without error/timeout, it's a short-circuit
    const finalStatus: TimelineItem['status'] =
      res.responded && status === 'ok' ? 'short-circuit' : status;

    timeline.push({
      key: step.key,
      name: step.name,
      startedAtMs: startedAt,
      durationMs,
      status: finalStatus,
      error: errorMsg,
      localsPreview: shallowPreview(res.locals),
    });

    // Stop execution on error, timeout, or short-circuit
    if (finalStatus !== 'ok') {
      break;
    }
  }

  return {
    timeline,
    final: {
      statusCode: res.statusCode,
      headers: res.headers,
      cookies: res.cookies,
      locals: res.locals,
      responded: res.responded,
      body: res.responseBody,
    },
  };
}
function shallowPreview(obj: Record<string, any>) {
  const out: Record<string, any> = {};
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
