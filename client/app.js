// Constants
const DEBOUNCE_DELAY = 300;
const MIN_BAR_WIDTH = 2;

// State
const state = {
  all: [], // catalog
  selected: [], // [{ key, options }]
};

// Cache DOM elements
const dom = {
  get mwList() {
    return document.getElementById('mw-list');
  },
  get selected() {
    return document.getElementById('selected');
  },
  get method() {
    return document.getElementById('method');
  },
  get path() {
    return document.getElementById('path');
  },
  get perStepTimeout() {
    return document.getElementById('per-step-timeout');
  },
  get headers() {
    return document.getElementById('headers');
  },
  get query() {
    return document.getElementById('query');
  },
  get body() {
    return document.getElementById('body');
  },
  get timeline() {
    return document.getElementById('timeline');
  },
  get result() {
    return document.getElementById('result');
  },
  get runBtn() {
    return document.getElementById('run');
  },
  get exportBtn() {
    return document.getElementById('export');
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SPINNER = createElement('span', 'spinner', '⏳');

// Helper functions
function createElement(tag, className = '', textContent = '', children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  children.forEach((child) => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  });
  return el;
}

function clearElement(el) {
  el.replaceChildren();
}

function parseJSON(value, fieldName) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    throw new Error(`Invalid JSON in ${fieldName} field`);
  }
}

// Toast notification for errors (better UX than alert)
function showError(message) {
  // Remove existing toast if any
  const existing = document.getElementById('error-toast');
  if (existing) existing.remove();

  const toast = createElement('div', 'error-toast');
  toast.id = 'error-toast';
  toast.setAttribute('role', 'alert');

  const text = createElement('span', '', `Error: ${message}`);
  const closeBtn = createElement('button', 'toast-close', '\u00d7');
  closeBtn.setAttribute('aria-label', 'Close error');
  closeBtn.addEventListener('click', () => toast.remove());

  toast.appendChild(text);
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);

  // Auto-dismiss after 5 seconds
  setTimeout(() => toast.remove(), 5000);
}

// Reusable API call wrapper to reduce duplication
async function apiCall(url, options = {}, retryConfig = {}) {
  const { retries = 2, retryDelayMs = 300 } = retryConfig;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        // Retry server errors; surface others immediately
        if (res.status >= 500 && attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await res.json();
          throw new Error(error.err || `Request failed: ${res.status}`);
        }
        throw new Error(`Request failed: ${res.status}`);
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

function validateSelection() {
  if (state.selected.length === 0) {
    showError('Please select at least one middleware.');
    return false;
  }
  return true;
}

// Cached metadata map - invalidated when catalog changes
let metaMapCache = null;
let metaMapCacheKey = null;

function getMetaMap() {
  // Invalidate cache if state.all reference changed
  if (metaMapCacheKey !== state.all) {
    metaMapCache = new Map(state.all.map((m) => [m.key, m]));
    metaMapCacheKey = state.all;
  }
  return metaMapCache;
}

async function fetchCatalog() {
  const list = dom.mwList;
  if (list) {
    clearElement(list);
    list.appendChild(
      createElement('p', 'loading-msg', 'Loading middleware...')
    );
  }

  try {
    const res = await apiCall('/api/middlewares');
    const data = await res.json();
    state.all = data.middlewares;
    renderCatalog();
  } catch (error) {
    console.error('Failed to fetch middleware catalog:', error);
    if (list) {
      clearElement(list);
      list.appendChild(
        createElement(
          'p',
          'error-msg',
          'Failed to load middleware catalog. Please refresh the page.'
        )
      );
    }
  }
}
function renderCatalog() {
  const list = dom.mwList;
  if (!list) return;
  clearElement(list);

  state.all.forEach((mw) => {
    const button = createElement('button', 'add', 'Add');
    button.setAttribute('aria-label', `Add ${mw.name} middleware`);
    button.addEventListener('click', () => addSelected(mw.key));

    const row = createElement('div', 'list', '', [
      createElement('div', '', '', [
        createElement('strong', null, mw.name),
        ' ',
        createElement('span', 'badge', mw.key),
        createElement('br'),
        createElement('small', null, mw.description),
      ]),
      createElement('div', '', '', [button]),
    ]);

    list.appendChild(row);
  });
}
function addSelected(key) {
  const meta = state.all.find((m) => m.key === key);
  if (!meta) return;
  const options =
    typeof structuredClone === 'function'
      ? structuredClone(meta.defaults || {})
      : JSON.parse(JSON.stringify(meta.defaults || {}));
  state.selected.push({ key, options });
  renderSelected();
}

function move(idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= state.selected.length) return;
  [state.selected[idx], state.selected[j]] = [
    state.selected[j],
    state.selected[idx],
  ];
  renderSelected();
}
function remove(idx) {
  state.selected.splice(idx, 1);
  renderSelected();
}
function renderSelected() {
  const cont = dom.selected;
  if (!cont) return;
  clearElement(cont);

  if (state.selected.length === 0) {
    cont.appendChild(
      createElement(
        'p',
        'loading-msg',
        'No middleware selected. Add middleware from the left panel.'
      )
    );
    return;
  }

  const metaMap = getMetaMap();

  state.selected.forEach((item, i) => {
    const meta = metaMap.get(item.key);
    if (!meta) return;

    const createButton = (text, label, disabled, onClick) => {
      const btn = createElement('button', null, text);
      btn.setAttribute('aria-label', label);
      btn.disabled = disabled;
      btn.addEventListener('click', onClick);
      return btn;
    };

    const card = createElement('div', 'card');
    const headerRow = createElement('div', 'row row-between');
    const titleDiv = createElement('div', '', '', [
      createElement('strong', null, meta.name),
      ' ',
      createElement('span', 'badge', item.key),
    ]);

    const upBtn = createButton('↑', `Move ${meta.name} up`, i === 0, () =>
      move(i, -1)
    );
    const downBtn = createButton(
      '↓',
      `Move ${meta.name} down`,
      i === state.selected.length - 1,
      () => move(i, 1)
    );
    const removeBtn = createButton('✕', `Remove ${meta.name}`, false, () =>
      remove(i)
    );

    const buttonDiv = createElement('div', '', '', [upBtn, downBtn, removeBtn]);

    headerRow.appendChild(titleDiv);
    headerRow.appendChild(buttonDiv);

    const colDiv = createElement('div', 'col');
    colDiv.appendChild(createElement('label', null, 'Options (JSON)'));

    const textarea = createElement('textarea', 'opts');
    textarea.value = JSON.stringify(item.options, null, 2);

    let parseTimeout;
    textarea.addEventListener('input', () => {
      clearTimeout(parseTimeout);
      parseTimeout = setTimeout(() => {
        try {
          state.selected[i].options = JSON.parse(textarea.value || '{}');
          textarea.classList.remove('json-invalid');
          textarea.classList.add('json-valid');
        } catch {
          textarea.classList.remove('json-valid');
          textarea.classList.add('json-invalid');
        }
      }, DEBOUNCE_DELAY);
    });

    colDiv.appendChild(textarea);
    card.appendChild(headerRow);
    card.appendChild(colDiv);
    cont.appendChild(card);
  });
}
async function run() {
  let started = false;
  try {
    if (!validateSelection()) return;
    beginBusy();
    started = true;

    if (
      !dom.method ||
      !dom.path ||
      !dom.headers ||
      !dom.query ||
      !dom.body ||
      !dom.perStepTimeout
    ) {
      throw new Error('Required form elements not found');
    }

    const headers = parseJSON(dom.headers.value, 'Headers');
    const query = parseJSON(dom.query.value, 'Query');
    const body = parseJSON(dom.body.value, 'Body');
    const perStepTimeoutMs = Number(dom.perStepTimeout.value);
    if (!Number.isFinite(perStepTimeoutMs) || perStepTimeoutMs <= 0) {
      throw new Error('Per-step timeout must be a positive number');
    }

    const payload = {
      method: dom.method.value,
      path: dom.path.value,
      headers,
      query,
      body,
    };
    const res = await apiCall('/api/compose/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chain: state.selected, payload, perStepTimeoutMs }),
    });
    const data = await res.json();
    renderTimeline(data);
  } catch (error) {
    console.error('Failed to execute middleware chain:', error);
    showError(error.message);
  } finally {
    if (started) endBusy();
  }
}
async function exportCode() {
  let started = false;
  try {
    if (!validateSelection()) return;
    beginBusy();
    started = true;

    const res = await apiCall('/api/compose/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chain: state.selected }),
    });
    const text = await res.text();
    if (dom.result) dom.result.textContent = text;
  } catch (error) {
    console.error('Failed to export middleware chain code:', error);
    showError(error.message);
  } finally {
    if (started) endBusy();
  }
}
function renderTimeline(data) {
  if (!dom.timeline || !dom.result) return;
  clearElement(dom.timeline);

  const max = Math.max(1, ...data.timeline.map((x) => x.durationMs));
  const allZero = data.timeline.every((x) => x.durationMs === 0);

  data.timeline.forEach((item) => {
    const span = createElement('span');
    const widthPercent = allZero ? 100 : (item.durationMs / max) * 100;
    span.style.width = `${Math.max(MIN_BAR_WIDTH, widthPercent)}%`;

    const barClass =
      item.status === 'error'
        ? 'bar error'
        : item.status === 'short-circuit'
          ? 'bar short'
          : 'bar';
    const bar = createElement('div', barClass, '', [span]);

    const labelText = ` — ${item.durationMs} ms — ${item.status}${
      item.error ? ` — ${item.error}` : ''
    }`;
    const label = createElement('div', '', '', [
      createElement('strong', null, item.name),
      labelText,
    ]);

    dom.timeline.appendChild(label);
    dom.timeline.appendChild(bar);
  });

  dom.result.textContent = JSON.stringify(data.final, null, 2);
}

// Initialize application
fetchCatalog();
renderSelected();

// Disable buttons during in-flight requests to prevent duplicate submissions
let pendingActions = 0;
function updateBusyState() {
  const disabled = pendingActions > 0;
  if (dom.runBtn) {
    dom.runBtn.disabled = disabled;
    toggleSpinner(dom.runBtn, disabled);
  }
  if (dom.exportBtn) {
    dom.exportBtn.disabled = disabled;
    toggleSpinner(dom.exportBtn, disabled);
  }
}
function beginBusy() {
  pendingActions += 1;
  updateBusyState();
}
function endBusy() {
  pendingActions = Math.max(0, pendingActions - 1);
  updateBusyState();
}
function toggleSpinner(button, show) {
  const existing = button.querySelector('.spinner');
  if (show) {
    if (existing) return;
    const clone = SPINNER.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    button.appendChild(clone);
  } else if (existing) {
    existing.remove();
  }
}

// Event listeners
dom.runBtn?.addEventListener('click', run);
dom.exportBtn?.addEventListener('click', exportCode);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Enter to run
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
  // Ctrl/Cmd + E to export
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    exportCode();
  }
});
