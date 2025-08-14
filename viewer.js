/* global window, document, fetch */
(function () {
  const state = {
    games: [],
    filtered: [],
    sortKey: 'rank',
    sortDir: 'asc', // 'asc' | 'desc'
    query: '',
    weightOp: 'all', // 'all' | 'lte' | 'gte'
    weightValue: '',
    minPlayersOp: 'all',
    minPlayersValue: '',
    maxPlayersOp: 'all',
    maxPlayersValue: '',
    minBestPlayersOp: 'all',
    minBestPlayersValue: '',
    maxBestPlayersOp: 'all',
    maxBestPlayersValue: '',
    minTimeOp: 'all',
    minTimeValue: '',
    maxTimeOp: 'all',
    maxTimeValue: ''
  };

  const numberKeys = new Set([
    'rank','year','geek_rating','avg_rating','num_voters','min_players','max_players','min_best_players','max_best_players','min_playing_time','max_playing_time','weight'
  ]);

  function getCellValue(game, key) {
    const value = game[key];
    if (value === null || value === undefined) return '';
    if (numberKeys.has(key)) return value;
    return String(value);
  }

  function compare(a, b, key, dir) {
    const va = getCellValue(a, key);
    const vb = getCellValue(b, key);
    let res = 0;
    if (typeof va === 'number' && typeof vb === 'number') {
      res = va - vb;
    } else {
      res = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
    }
    return dir === 'asc' ? res : -res;
  }

  function applyFilterAndSort() {
    const q = state.query.trim().toLowerCase();
    let rows = state.games.slice();
    if (q) {
      rows = rows.filter(g => (
        (g.title || '').toLowerCase().includes(q) || String(g.year || '').includes(q)
      ));
    }
    // Weight filter
    if (state.weightValue !== '') {
      const normalized = String(state.weightValue).replace(',', '.');
      const threshold = Number(normalized);
      if (!Number.isNaN(threshold)) {
        const op = state.weightOp === 'all' ? 'gte' : state.weightOp; // default to >= when a value is present
        if (op === 'lte') rows = rows.filter(g => { const gw = Number(g.weight); return !Number.isNaN(gw) && gw <= threshold; });
        if (op === 'gte') rows = rows.filter(g => { const gw = Number(g.weight); return !Number.isNaN(gw) && gw >= threshold; });
      }
    }

    // Min players
    if (state.minPlayersValue !== '') {
      const t = Number(state.minPlayersValue);
      if (!Number.isNaN(t)) {
        const op = state.minPlayersOp === 'all' ? 'gte' : state.minPlayersOp;
        if (op === 'lte') rows = rows.filter(g => { const v = Number(g.min_players); return !Number.isNaN(v) && v <= t; });
        if (op === 'gte') rows = rows.filter(g => { const v = Number(g.min_players); return !Number.isNaN(v) && v >= t; });
      }
    }

    // Max players
    if (state.maxPlayersValue !== '') {
      const t = Number(state.maxPlayersValue);
      if (!Number.isNaN(t)) {
        const op = state.maxPlayersOp === 'all' ? 'gte' : state.maxPlayersOp;
        if (op === 'lte') rows = rows.filter(g => { const v = Number(g.max_players); return !Number.isNaN(v) && v <= t; });
        if (op === 'gte') rows = rows.filter(g => { const v = Number(g.max_players); return !Number.isNaN(v) && v >= t; });
      }
    }

    // Best min players
    if (state.minBestPlayersValue !== '') {
      const t = Number(state.minBestPlayersValue);
      if (!Number.isNaN(t)) {
        const op = state.minBestPlayersOp === 'all' ? 'gte' : state.minBestPlayersOp;
        if (op === 'lte') rows = rows.filter(g => { const v = Number(g.min_best_players); return !Number.isNaN(v) && v <= t; });
        if (op === 'gte') rows = rows.filter(g => { const v = Number(g.min_best_players); return !Number.isNaN(v) && v >= t; });
      }
    }

    // Best max players
    if (state.maxBestPlayersValue !== '') {
      const t = Number(state.maxBestPlayersValue);
      if (!Number.isNaN(t)) {
        const op = state.maxBestPlayersOp === 'all' ? 'gte' : state.maxBestPlayersOp;
        if (op === 'lte') rows = rows.filter(g => { const v = Number(g.max_best_players); return !Number.isNaN(v) && v <= t; });
        if (op === 'gte') rows = rows.filter(g => { const v = Number(g.max_best_players); return !Number.isNaN(v) && v >= t; });
      }
    }

    // Min time
    if (state.minTimeValue !== '') {
      const t = Number(state.minTimeValue);
      if (!Number.isNaN(t)) {
        const op = state.minTimeOp === 'all' ? 'gte' : state.minTimeOp;
        if (op === 'lte') rows = rows.filter(g => { const v = Number(g.min_playing_time); return !Number.isNaN(v) && v <= t; });
        if (op === 'gte') rows = rows.filter(g => { const v = Number(g.min_playing_time); return !Number.isNaN(v) && v >= t; });
      }
    }

    // Max time
    if (state.maxTimeValue !== '') {
      const t = Number(state.maxTimeValue);
      if (!Number.isNaN(t)) {
        const op = state.maxTimeOp === 'all' ? 'gte' : state.maxTimeOp;
        if (op === 'lte') rows = rows.filter(g => { const v = Number(g.max_playing_time); return !Number.isNaN(v) && v <= t; });
        if (op === 'gte') rows = rows.filter(g => { const v = Number(g.max_playing_time); return !Number.isNaN(v) && v >= t; });
      }
    }
    rows.sort((a, b) => compare(a, b, state.sortKey, state.sortDir));
    state.filtered = rows;
    renderTableBody(rows);
    renderSummary();
    updateSortIndicators();
  }

  function renderSummary() {
    const el = document.getElementById('summary');
    if (!el) return;
    const parts = [];
    if (state.weightValue !== '') parts.push(`Weight ${(state.weightOp === 'lte') ? '≤' : '≥'} ${String(state.weightValue).replace(',', '.')}`);
    if (state.minPlayersValue !== '') parts.push(`Min P ${(state.minPlayersOp === 'lte') ? '≤' : '≥'} ${state.minPlayersValue}`);
    if (state.maxPlayersValue !== '') parts.push(`Max P ${(state.maxPlayersOp === 'lte') ? '≤' : '≥'} ${state.maxPlayersValue}`);
    if (state.minBestPlayersValue !== '') parts.push(`Best Min ${(state.minBestPlayersOp === 'lte') ? '≤' : '≥'} ${state.minBestPlayersValue}`);
    if (state.maxBestPlayersValue !== '') parts.push(`Best Max ${(state.maxBestPlayersOp === 'lte') ? '≤' : '≥'} ${state.maxBestPlayersValue}`);
    if (state.minTimeValue !== '') parts.push(`Min Time ${(state.minTimeOp === 'lte') ? '≤' : '≥'} ${state.minTimeValue}`);
    if (state.maxTimeValue !== '') parts.push(`Max Time ${(state.maxTimeOp === 'lte') ? '≤' : '≥'} ${state.maxTimeValue}`);
    const extra = parts.length ? ` • ${parts.join(' • ')}` : '';
    el.textContent = `${state.filtered.length} of ${state.games.length} games${extra}`;
  }

  function createCell(tag, className, text) {
    const td = document.createElement(tag);
    if (className) td.className = className;
    if (text !== undefined && text !== null && text !== '') td.textContent = text;
    return td;
  }

  function renderTableBody(rows) {
    const tbody = document.querySelector('#gamesTable tbody');
    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const g of rows) {
      const tr = document.createElement('tr');
      tr.appendChild(createCell('td', 'rank num', g.rank));
      const imgTd = createCell('td', 'img');
      if (g.image) {
        const src = String(g.image).startsWith('@') ? String(g.image).slice(1) : g.image;
        const img = document.createElement('img');
        img.src = src;
        img.alt = `${g.title}`;
        img.loading = 'lazy';
        imgTd.appendChild(img);
      }
      tr.appendChild(imgTd);
      const titleTd = createCell('td', 'title');
      const link = document.createElement('a');
      link.href = g.url || '#';
      link.textContent = g.title || '';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      titleTd.appendChild(link);
      if (g.year) {
        const small = document.createElement('span');
        small.className = 'muted';
        small.textContent = ` (${g.year})`;
        titleTd.appendChild(small);
      }
      tr.appendChild(titleTd);
      tr.appendChild(createCell('td', 'num', g.year ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.geek_rating ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.avg_rating ?? ''));
      tr.appendChild(createCell('td', 'num', g.num_voters ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.min_players ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.max_players ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.min_best_players ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.max_best_players ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.min_playing_time ?? ''));
      tr.appendChild(createCell('td', 'num optional', g.max_playing_time ?? ''));
      tr.appendChild(createCell('td', 'num', g.weight ?? ''));
      fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);
  }

  function updateSortIndicators() {
    const ths = document.querySelectorAll('thead th.sortable');
    ths.forEach(th => {
      const key = th.getAttribute('data-key');
      const arrow = th.querySelector('.arrow');
      if (!arrow) {
        const span = document.createElement('span');
        span.className = 'arrow';
        span.textContent = '▾';
        th.appendChild(span);
      }
      th.querySelector('.arrow').style.opacity = key === state.sortKey ? 1 : 0.35;
      th.querySelector('.arrow').textContent = state.sortDir === 'asc' ? '▾' : '▴';
    });
  }

  function attachEvents() {
    const search = document.getElementById('search');
    search.addEventListener('input', () => {
      state.query = search.value;
      applyFilterAndSort();
    });

    // Filters toggle
    const filtersToggle = document.getElementById('filters-toggle');
    const filtersSection = document.getElementById('filters-section');
    const toggleIcon = filtersToggle.querySelector('.toggle-icon');
    const toggleText = filtersToggle.querySelector('.toggle-text');
    
    filtersToggle.addEventListener('click', () => {
      const isHidden = filtersSection.classList.contains('hidden');
      if (isHidden) {
        filtersSection.classList.remove('hidden');
        toggleIcon.classList.add('expanded');
        toggleText.textContent = 'Hide Filters';
      } else {
        filtersSection.classList.add('hidden');
        toggleIcon.classList.remove('expanded');
        toggleText.textContent = 'Show Filters';
      }
    });

    // Weight
    const op = document.getElementById('weight-op');
    const val = document.getElementById('weight-value');
    const onWeightChange = () => { state.weightValue = val.value; applyFilterAndSort(); };
    const onWeightOpChange = () => { state.weightOp = op.value; applyFilterAndSort(); };
    op.addEventListener('change', onWeightOpChange);
    val.addEventListener('input', onWeightChange);
    val.addEventListener('change', onWeightChange);
    state.weightOp = op.value;
    state.weightValue = val.value;

    // Min Players
    const minPlayersOp = document.getElementById('min-players-op');
    const minPlayersVal = document.getElementById('min-players-value');
    const onMinPlayersChange = () => { state.minPlayersValue = minPlayersVal.value; applyFilterAndSort(); };
    const onMinPlayersOpChange = () => { state.minPlayersOp = minPlayersOp.value; applyFilterAndSort(); };
    minPlayersOp.addEventListener('change', onMinPlayersOpChange);
    minPlayersVal.addEventListener('input', onMinPlayersChange);
    minPlayersVal.addEventListener('change', onMinPlayersChange);
    state.minPlayersOp = minPlayersOp.value;
    state.minPlayersValue = minPlayersVal.value;

    // Max Players
    const maxPlayersOp = document.getElementById('max-players-op');
    const maxPlayersVal = document.getElementById('max-players-value');
    const onMaxPlayersChange = () => { state.maxPlayersValue = maxPlayersVal.value; applyFilterAndSort(); };
    const onMaxPlayersOpChange = () => { state.maxPlayersOp = maxPlayersOp.value; applyFilterAndSort(); };
    maxPlayersOp.addEventListener('change', onMaxPlayersOpChange);
    maxPlayersVal.addEventListener('input', onMaxPlayersChange);
    maxPlayersVal.addEventListener('change', onMaxPlayersChange);
    state.maxPlayersOp = maxPlayersOp.value;
    state.maxPlayersValue = maxPlayersVal.value;

    // Best Min Players
    const minBestPlayersOp = document.getElementById('min-best-players-op');
    const minBestPlayersVal = document.getElementById('min-best-players-value');
    const onMinBestPlayersChange = () => { state.minBestPlayersValue = minBestPlayersVal.value; applyFilterAndSort(); };
    const onMinBestPlayersOpChange = () => { state.minBestPlayersOp = minBestPlayersOp.value; applyFilterAndSort(); };
    minBestPlayersOp.addEventListener('change', onMinBestPlayersOpChange);
    minBestPlayersVal.addEventListener('input', onMinBestPlayersChange);
    minBestPlayersVal.addEventListener('change', onMinBestPlayersChange);
    state.minBestPlayersOp = minBestPlayersOp.value;
    state.minBestPlayersValue = minBestPlayersVal.value;

    // Best Max Players
    const maxBestPlayersOp = document.getElementById('max-best-players-op');
    const maxBestPlayersVal = document.getElementById('max-best-players-value');
    const onMaxBestPlayersChange = () => { state.maxBestPlayersValue = maxBestPlayersVal.value; applyFilterAndSort(); };
    const onMaxBestPlayersOpChange = () => { state.maxBestPlayersOp = maxBestPlayersOp.value; applyFilterAndSort(); };
    maxBestPlayersOp.addEventListener('change', onMaxBestPlayersOpChange);
    maxBestPlayersVal.addEventListener('input', onMaxBestPlayersChange);
    maxBestPlayersVal.addEventListener('change', onMaxBestPlayersChange);
    state.maxBestPlayersOp = maxBestPlayersOp.value;
    state.maxBestPlayersValue = maxBestPlayersVal.value;

    // Min Time
    const minTimeOp = document.getElementById('min-time-op');
    const minTimeVal = document.getElementById('min-time-value');
    const onMinTimeChange = () => { state.minTimeValue = minTimeVal.value; applyFilterAndSort(); };
    const onMinTimeOpChange = () => { state.minTimeOp = minTimeOp.value; applyFilterAndSort(); };
    minTimeOp.addEventListener('change', onMinTimeOpChange);
    minTimeVal.addEventListener('input', onMinTimeChange);
    minTimeVal.addEventListener('change', onMinTimeChange);
    state.minTimeOp = minTimeOp.value;
    state.minTimeValue = minTimeVal.value;

    // Max Time
    const maxTimeOp = document.getElementById('max-time-op');
    const maxTimeVal = document.getElementById('max-time-value');
    const onMaxTimeChange = () => { state.maxTimeValue = maxTimeVal.value; applyFilterAndSort(); };
    const onMaxTimeOpChange = () => { state.maxTimeOp = maxTimeOp.value; applyFilterAndSort(); };
    maxTimeOp.addEventListener('change', onMaxTimeOpChange);
    maxTimeVal.addEventListener('input', onMaxTimeChange);
    maxTimeVal.addEventListener('change', onMaxTimeChange);
    state.maxTimeOp = maxTimeOp.value;
    state.maxTimeValue = maxTimeVal.value;

    document.querySelectorAll('thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-key');
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = key === 'title' ? 'asc' : 'desc';
        }
        applyFilterAndSort();
      });
    });
  }

  async function load() {
    // Prefer boardgames.json, fall back to first_page_detailed.json
    const candidates = ['boardgames.json'];
    let data = null;
    let lastErr = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${res.status}`);
        data = await res.json();
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!data) throw lastErr || new Error('Failed to load data');
    state.games = Array.isArray(data) ? data : [];
    attachEvents();
    applyFilterAndSort();
  }

  load().catch(err => {
    const el = document.querySelector('main .wrap');
    const div = document.createElement('div');
    div.style.color = '#fca5a5';
    div.style.margin = '16px 0';
    div.textContent = `Failed to load data: ${err.message}`;
    el.appendChild(div);
  });
})();


