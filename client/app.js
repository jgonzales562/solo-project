const state = {
  all: [], // catalog
  selected: [], // [{ key, options }]
};

async function fetchCatalog() {
  const res = await fetch('/api/middlewares');
  const data = await res.json();
  state.all = data.middlewares;
  renderCatalog();
}
function renderCatalog() {
  const list = document.getElementById('mw-list');
  list.innerHTML = '';
  state.all.forEach((mw) => {
    const row = document.createElement('div');
    row.className = 'list';
    row.innerHTML = `
      <div>
        <strong>${mw.name}</strong> <span class="badge">${mw.key}</span><br/>
        <small>${mw.description}</small>
      </div>
      <div>
        <button data-key="${mw.key}" class="add">Add</button>
      </div>
    `;
    list.appendChild(row);
  });
  list
    .querySelectorAll('.add')
    .forEach((btn) =>
      btn.addEventListener('click', () => addSelected(btn.dataset.key))
    );
}
function addSelected(key) {
  const meta = state.all.find((m) => m.key === key);
  state.selected.push({ key, options: structuredClone(meta?.defaults || {}) });
  renderSelected();
}

function move(idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= state.selected.length) return;
  const tmp = state.selected[idx];
  state.selected[idx] = state.selected[j];
  state.selected[j] = tmp;
  renderSelected();
}
function remove(idx) {
  state.selected.splice(idx, 1);
  renderSelected();
}
function renderSelected() {
  const cont = document.getElementById('selected');
  cont.innerHTML = '';
  state.selected.forEach((item, i) => {
    const meta = state.all.find((m) => m.key === item.key);
    const card = document.createElement('div');
    card.className = 'card';
    const text = JSON.stringify(item.options || {}, null, 2);
    card.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <div><strong>${meta?.name}</strong> <span class="badge">${item.key}</span></div>
        <div>
          <button data-i="${i}" class="up">↑</button>
          <button data-i="${i}" class="down">↓</button>
          <button data-i="${i}" class="remove">✕</button>
        </div>
      </div>
      <div class="col">
        <label>Options (JSON)</label>
        <textarea data-i="${i}" class="opts">${text}</textarea>
      </div>
    `;
    cont.appendChild(card);
  });
  cont
    .querySelectorAll('.up')
    .forEach((b) =>
      b.addEventListener('click', () => move(Number(b.dataset.i), -1))
    );
  cont
    .querySelectorAll('.down')
    .forEach((b) =>
      b.addEventListener('click', () => move(Number(b.dataset.i), +1))
    );
  cont
    .querySelectorAll('.remove')
    .forEach((b) =>
      b.addEventListener('click', () => remove(Number(b.dataset.i)))
    );
  cont.querySelectorAll('.opts').forEach((t) =>
    t.addEventListener('input', () => {
      try {
        state.selected[Number(t.dataset.i)].options = JSON.parse(
          t.value || '{}'
        );
      } catch {}
    })
  );
}
async function run() {
  const payload = {
    method: document.getElementById('method').value,
    path: document.getElementById('path').value,
    headers: JSON.parse(document.getElementById('headers').value || '{}'),
    query: JSON.parse(document.getElementById('query').value || '{}'),
    body: JSON.parse(document.getElementById('body').value || '{}'),
  };
  const res = await fetch('/api/compose/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chain: state.selected, payload }),
  });
  const data = await res.json();
  renderTimeline(data);
}
async function exportCode() {
  const res = await fetch('/api/compose/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chain: state.selected }),
  });
  const text = await res.text();
  const pre = document.getElementById('result');
  pre.textContent = text;
}
function renderTimeline(data) {
  const t = document.getElementById('timeline');
  const pre = document.getElementById('result');
  t.innerHTML = '';
  const max = Math.max(1, ...data.timeline.map((x) => x.durationMs));
  data.timeline.forEach((item) => {
    const row = document.createElement('div');
    const bar = document.createElement('div');
    bar.className = 'bar';
    if (item.status === 'error') bar.classList.add('error');
    if (item.status === 'short-circuit') bar.classList.add('short');
    const span = document.createElement('span');
    span.style.width = `${(item.durationMs / max) * 100}%`;
    bar.appendChild(span);
    row.appendChild(bar);

    const label = document.createElement('div');
    label.innerHTML = `<strong>${item.name}</strong> — ${
      item.durationMs
    } ms — ${item.status}${item.error ? ' — ' + item.error : ''}`;
    t.appendChild(label);
    t.appendChild(row);
  });
  pre.textContent = JSON.stringify(data.final, null, 2);
}
// wiring
fetchCatalog();
renderSelected();
document.getElementById('run').addEventListener('click', run);
document.getElementById('export').addEventListener('click', exportCode);
