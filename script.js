/* ============================================================
   script.js — Market Basket Analysis Dashboard
   Modular Vanilla JavaScript:
     1. Data loading & parsing (PapaParse)
     2. Filtering logic
     3. KPI rendering
     4. Chart rendering (Chart.js)
     5. Heatmap rendering
     6. Rules table (sortable + searchable)
     7. Raw data viewer (tab, pagination, search, download)
     8. Tooltip / info modal
   ============================================================ */

'use strict';

// ──────────────────────────────────────────────
// §1  GLOBAL STATE
// ──────────────────────────────────────────────

/** Raw data loaded from CSVs */
const RAW = { orders: [], rules: [] };

/** Currently filtered rules (updated on every filter change) */
let filteredRules = [];

/** Chart.js instances (kept so we can destroy/recreate) */
const CHARTS = { top10: null, histogram: null, region: null };

/** Current sort state for the rules table */
const sortState = { col: 'lift', dir: 'desc' };

/** Search string for rules table */
let searchQuery = '';

// ── Raw data viewer state ──
/** Which dataset is shown: 'orders' | 'rules' */
let rawActiveTab  = 'orders';
/** Current search query for raw table */
let rawSearch     = '';
/** Current page index (0-based) */
let rawPage       = 0;
/** Rows per page */
const RAW_PAGE_SIZE = 50;


// ──────────────────────────────────────────────
// §2  TOOLTIP COPY
//     Plain-language explanations per topic
// ──────────────────────────────────────────────
const TIPS = {
  support: {
    title: '📊 Support',
    body: 'Support mengukur seberapa sering suatu kombinasi produk muncul bersamaan dalam seluruh transaksi. Contoh: support 0.20 berarti 20% transaksi mengandung pasangan produk tersebut. Semakin tinggi, semakin umum pola tersebut.'
  },
  confidence: {
    title: '🎯 Confidence',
    body: 'Confidence mengukur seberapa besar kemungkinan produk B dibeli jika produk A sudah dibeli. Contoh: confidence 0.80 berarti 80% pembeli produk A juga membeli produk B. Semakin tinggi, semakin kuat hubungannya.'
  },
  lift: {
    title: '🚀 Lift',
    body: 'Lift mengukur seberapa jauh lebih kuat hubungan antara dua produk dibanding kebetulan semata. Lift > 1 berarti kedua produk cenderung dibeli bersamaan (positif), = 1 berarti tidak ada hubungan, < 1 berarti jarang dibeli bersamaan.'
  },
  transaksi: {
    title: '🧾 Total Transaksi',
    body: 'Jumlah Order ID unik yang ditemukan dalam dataset. Setiap Order ID mewakili satu sesi belanja pelanggan yang mungkin berisi banyak produk berbeda.'
  },
  produk: {
    title: '📦 Total Produk Unik',
    body: 'Jumlah nama produk yang berbeda di seluruh dataset transaksi. Produk yang muncul di banyak transaksi adalah kandidat kuat untuk masuk ke association rules.'
  },
  rules: {
    title: '🔗 Total Rules Ditemukan',
    body: 'Jumlah association rules yang lolos filter saat ini (Support, Confidence, Lift minimum). Rules adalah pola "jika beli A → cenderung beli B" yang ditemukan oleh algoritma data mining.'
  },
  top10: {
    title: '📊 Top 10 Pasangan Produk',
    body: 'Bar chart ini menampilkan 10 pasangan produk dengan nilai Lift tertinggi setelah filter diterapkan. Lift tinggi menunjukkan hubungan pembelian yang paling kuat dan bukan sekadar kebetulan.'
  },
  histogram: {
    title: '📊 Distribusi Item per Transaksi',
    body: 'Histogram ini menunjukkan berapa banyak transaksi yang mengandung 1, 2, 3, atau lebih item. Pola ini membantu memahami kebiasaan belanja pelanggan — apakah cenderung membeli sedikit atau banyak produk sekaligus.'
  },
  heatmap: {
    title: '🗺️ Heatmap Co-occurrence Kategori',
    body: 'Heatmap ini menunjukkan intensitas hubungan (jumlah rules) antara pasangan kategori produk. Warna lebih gelap berarti lebih banyak rules yang menghubungkan dua kategori tersebut. Berguna untuk menemukan kategori mana yang saling melengkapi.'
  },
  region: {
    title: '🗺️ Pola Pembelian per Region',
    body: 'Bar chart ini membandingkan jumlah association rules dominan di tiap Region. Region dengan rules lebih banyak menunjukkan pola pembelian yang lebih beragam dan terstruktur.'
  },
  tabel: {
    title: '📋 Tabel Association Rules',
    body: 'Tabel ini menampilkan semua rules yang lolos filter. Klik header kolom untuk mengurutkan berdasarkan Support, Confidence, atau Lift. Gunakan kotak pencarian untuk menyaring berdasarkan nama produk (antecedent atau consequent).'
  },
  rawdata: {
    title: '📂 Dataset Mentah',
    body: 'Bagian ini menampilkan data asli sebelum diproses: (1) orders.csv berisi setiap baris transaksi mentah dengan detail produk, kategori, region, dan penjualan. (2) rules.csv berisi hasil algoritma Association Rule Mining dengan metrik Support, Confidence, dan Lift. Gunakan tombol ⬇ untuk mengunduh file CSV langsung.'
  }
};


// ──────────────────────────────────────────────
// §3  DATA LOADING
//     Loads both CSV files via PapaParse,
//     then initialises the whole dashboard.
// ──────────────────────────────────────────────

/**
 * Loads a local CSV file using PapaParse.
 * @param {string} filePath  - relative path to the CSV
 * @returns {Promise<Array>} - array of row objects
 */
function loadCSV(filePath) {
  return new Promise((resolve, reject) => {
    Papa.parse(filePath, {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => resolve(results.data),
      error:    (err)     => reject(err)
    });
  });
}

/** Entry point: load both CSVs then boot the dashboard */
async function init() {
  try {
    const [orders, rules] = await Promise.all([
      loadCSV('data/orders.csv'),
      loadCSV('data/rules.csv')
    ]);

    // Normalise column names to lowercase-trimmed keys
    RAW.orders = orders.map(normaliseRow);
    RAW.rules  = rules.map(normaliseRow);

    // Mark data as loaded in the header status badge
    document.getElementById('status-text').textContent = 'Data dimuat';
    document.querySelector('.loader-dot').style.background = '#34d399';

    // Populate filter dropdowns from raw data
    populateDropdowns();

    // Run first filter pass (no filters active → show all)
    applyFilters();

    // Render raw data viewer (tab counts + initial table)
    updateTabCounts();
    renderRawTable();

    // Wire up all UI event listeners
    bindEvents();
    bindRawDataEvents();

  } catch (err) {
    console.error('Gagal memuat CSV:', err);
    document.getElementById('status-text').textContent = 'Gagal memuat data';
    document.querySelector('.loader-dot').style.background = '#f87171';
  }
}

/**
 * Normalises a parsed CSV row so all keys are lowercase strings
 * and values are trimmed where possible.
 */
function normaliseRow(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    const val      = row[key];
    out[cleanKey]  = typeof val === 'string' ? val.trim() : val;
  }
  return out;
}


// ──────────────────────────────────────────────
// §4  FILTER LOGIC
//     Re-derives filteredRules and rebuilds all
//     visualisations whenever a filter changes.
// ──────────────────────────────────────────────

/** Reads current slider/dropdown values and returns a filter config object */
function getFilterConfig() {
  return {
    minSupport:    parseFloat(document.getElementById('filter-support').value)    || 0,
    minConfidence: parseFloat(document.getElementById('filter-confidence').value) || 0,
    minLift:       parseFloat(document.getElementById('filter-lift').value)       || 0,
    category:      document.getElementById('filter-category').value,
    region:        document.getElementById('filter-region').value
  };
}

/**
 * Core filtering function.
 * Filters RAW.rules based on current slider/dropdown state,
 * then triggers a full dashboard refresh.
 *
 * Category filter checks BOTH antecedent and consequent categories.
 * Region filter checks the rule's associated region.
 */
function applyFilters() {
  const cfg = getFilterConfig();

  filteredRules = RAW.rules.filter(rule => {
    // Numeric threshold checks
    if (rule.support    < cfg.minSupport)    return false;
    if (rule.confidence < cfg.minConfidence) return false;
    if (rule.lift       < cfg.minLift)       return false;

    // Category filter: keep rule if either end belongs to the chosen category
    if (cfg.category) {
      const catAnt = (rule.category_antecedent || '').toLowerCase();
      const catCon = (rule.category_consequent  || '').toLowerCase();
      if (!catAnt.includes(cfg.category.toLowerCase()) &&
          !catCon.includes(cfg.category.toLowerCase())) {
        return false;
      }
    }

    // Region filter
    if (cfg.region) {
      if ((rule.region || '').toLowerCase() !== cfg.region.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  // Re-render everything after filtering
  renderKPIs();
  renderTop10Chart();
  renderHistogram();
  renderHeatmap();
  renderRegionChart();
  renderTable();
}


// ──────────────────────────────────────────────
// §5  KPI RENDERING
//     Calculates and injects KPI card values.
//     Total Transaksi and Total Produk are
//     derived from the orders data (not filtered).
// ──────────────────────────────────────────────

function renderKPIs() {
  // Total Transaksi: unique Order IDs in the full orders dataset
  const orderIds  = new Set(RAW.orders.map(r => r['order_id']));
  const products  = new Set(RAW.orders.map(r => r['product_name']));

  // Total Rules and Average Lift are based on the FILTERED rules
  const totalRules = filteredRules.length;
  const avgLift    = totalRules > 0
    ? (filteredRules.reduce((s, r) => s + (r.lift || 0), 0) / totalRules).toFixed(2)
    : '—';

  document.getElementById('kpi-transaksi').textContent = orderIds.size.toLocaleString('id-ID');
  document.getElementById('kpi-produk').textContent    = products.size.toLocaleString('id-ID');
  document.getElementById('kpi-rules').textContent     = totalRules.toLocaleString('id-ID');
  document.getElementById('kpi-lift').textContent      = avgLift;
}


// ──────────────────────────────────────────────
// §6  CHART HELPERS
// ──────────────────────────────────────────────

/** Palette of distinct category colours */
const CATEGORY_COLORS = [
  '#3b82f6', '#7c3aed', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16'
];

/** Destroys and recreates a Chart.js instance */
function rebuildChart(key, ctx, config) {
  if (CHARTS[key]) {
    CHARTS[key].destroy();
    CHARTS[key] = null;
  }
  CHARTS[key] = new Chart(ctx, config);
}

/** Shortens a long product pair label for chart display */
function shortLabel(ant, con) {
  const label = `${ant} → ${con}`;
  return label.length > 44 ? label.slice(0, 41) + '…' : label;
}


// ──────────────────────────────────────────────
// §7  TOP-10 BAR CHART (Horizontal)
//     Shows top 10 rules by Lift from filteredRules
// ──────────────────────────────────────────────

function renderTop10Chart() {
  const ctx = document.getElementById('chart-top10lift').getContext('2d');

  // Sort by Lift descending, take top 10
  const top10 = [...filteredRules]
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 10);

  if (top10.length === 0) {
    rebuildChart('top10', ctx, emptyChart('Tidak ada rules yang memenuhi filter'));
    return;
  }

  const labels = top10.map(r => shortLabel(r.antecedent, r.consequent));
  const data   = top10.map(r => parseFloat(r.lift.toFixed(2)));

  // Colour each bar based on its category (antecedent category)
  const categories = [...new Set(top10.map(r => r.category_antecedent || 'Unknown'))];
  const colourMap  = {};
  categories.forEach((cat, i) => { colourMap[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]; });
  const barColors  = top10.map(r => colourMap[r.category_antecedent || 'Unknown'] + 'cc');

  rebuildChart('top10', ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Lift',
        data,
        backgroundColor: barColors,
        borderColor:     barColors.map(c => c.replace('cc', 'ff')),
        borderWidth: 1,
        borderRadius: 5,
      }]
    },
    options: {
      indexAxis: 'y',            // horizontal bar
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const r = top10[items[0].dataIndex];
              return [`${r.antecedent}`, `→ ${r.consequent}`];
            },
            label: (item) => {
              const r = top10[item.dataIndex];
              return [
                ` Lift: ${r.lift.toFixed(2)}`,
                ` Support: ${(r.support * 100).toFixed(1)}%`,
                ` Confidence: ${(r.confidence * 100).toFixed(1)}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 11 } },
          title: { display: true, text: 'Lift Value', font: { size: 11 } }
        },
        y: {
          ticks: { font: { size: 10 } }
        }
      }
    }
  });
}


// ──────────────────────────────────────────────
// §8  HISTOGRAM — Items per Transaction
//     Computed from RAW.orders (not filtered rules)
// ──────────────────────────────────────────────

function renderHistogram() {
  const ctx = document.getElementById('chart-histogram').getContext('2d');

  // Count items per unique Order ID
  const counts = {};
  RAW.orders.forEach(row => {
    const id = row['order_id'];
    if (id) counts[id] = (counts[id] || 0) + (parseInt(row['quantity']) || 1);
  });

  // Bin the per-transaction counts (1-item, 2-item, 3-item, 4+)
  const bins  = { '1': 0, '2': 0, '3': 0, '4+': 0 };
  Object.values(counts).forEach(n => {
    if (n <= 3) bins[String(n)]++;
    else        bins['4+']++;
  });

  const labels = Object.keys(bins);
  const data   = Object.values(bins);

  rebuildChart('histogram', ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Jumlah Transaksi',
        data,
        backgroundColor: ['#93c5fd', '#c4b5fd', '#6ee7b7', '#fde68a'],
        borderColor:     ['#3b82f6', '#7c3aed', '#10b981', '#f59e0b'],
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.raw} transaksi`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: 'Jumlah Item per Transaksi', font: { size: 11 } }
        },
        y: {
          grid: { color: '#f1f5f9' },
          title: { display: true, text: 'Frekuensi Transaksi', font: { size: 11 } },
          ticks: { precision: 0 }
        }
      }
    }
  });
}


// ──────────────────────────────────────────────
// §9  HEATMAP — Co-occurrence per Category pair
//     Counts how many FILTERED rules exist for each
//     (antecedent_category × consequent_category) pair.
// ──────────────────────────────────────────────

function renderHeatmap() {
  const container = document.getElementById('heatmap-container');

  // Gather all unique categories involved in filtered rules
  const catSet = new Set();
  filteredRules.forEach(r => {
    if (r.category_antecedent) catSet.add(r.category_antecedent);
    if (r.category_consequent)  catSet.add(r.category_consequent);
  });
  const cats = [...catSet].sort();

  if (cats.length === 0) {
    container.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm">Tidak ada data untuk ditampilkan</p>';
    return;
  }

  // Count rules for each category pair (matrix)
  const matrix = {};
  cats.forEach(r => {
    matrix[r] = {};
    cats.forEach(c => { matrix[r][c] = 0; });
  });
  filteredRules.forEach(rule => {
    const ant = rule.category_antecedent;
    const con = rule.category_consequent;
    if (ant && con && matrix[ant] && matrix[ant][con] !== undefined) {
      matrix[ant][con]++;
    }
  });

  // Find max count for colour scaling
  let maxCount = 1;
  cats.forEach(r => cats.forEach(c => { if (matrix[r][c] > maxCount) maxCount = matrix[r][c]; }));

  /**
   * Maps a count to an RGBA colour.
   * 0 → light grey  |  maxCount → deep blue
   */
  function cellColor(count) {
    if (count === 0) return null;
    const t = count / maxCount;          // 0..1
    const r = Math.round(59  + (15 - 59)  * t);   // 59→15 (3b→0f)
    const g = Math.round(130 + (23 - 130) * t);   // 130→23
    const b = Math.round(246 + (42 - 246) * t);   // 246→42
    return `rgb(${r},${g},${b})`;
  }

  // Build HTML table for the heatmap
  let html = '<table class="heatmap-table"><thead><tr><th></th>';
  cats.forEach(c => { html += `<th>${c}</th>`; });
  html += '</tr></thead><tbody>';

  cats.forEach(rowCat => {
    html += `<tr><th class="row-header">${rowCat}</th>`;
    cats.forEach(colCat => {
      const count = matrix[rowCat][colCat];
      const bg    = cellColor(count);
      if (bg) {
        html += `<td class="heatmap-cell" style="background:${bg}" title="${rowCat} → ${colCat}: ${count} rules">${count}</td>`;
      } else {
        html += `<td class="heatmap-cell empty" title="${rowCat} → ${colCat}: 0 rules">0</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}


// ──────────────────────────────────────────────
// §10  REGION CHART — Rules per Region
//      Counts filtered rules per Region (grouped bar
//      or simple bar showing total rules per region)
// ──────────────────────────────────────────────

function renderRegionChart() {
  const ctx = document.getElementById('chart-region').getContext('2d');

  // Count rules per region from filteredRules
  const regionCounts = {};
  filteredRules.forEach(r => {
    const reg = r.region || 'Unknown';
    regionCounts[reg] = (regionCounts[reg] || 0) + 1;
  });

  // Also provide a breakdown by dominant category pair per region
  const regions = Object.keys(regionCounts).sort();

  if (regions.length === 0) {
    rebuildChart('region', ctx, emptyChart('Tidak ada rules yang memenuhi filter'));
    return;
  }

  const counts = regions.map(r => regionCounts[r]);
  const colours = regions.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);

  rebuildChart('region', ctx, {
    type: 'bar',
    data: {
      labels: regions,
      datasets: [{
        label: 'Jumlah Rules',
        data:  counts,
        backgroundColor: colours.map(c => c + '99'),
        borderColor:     colours,
        borderWidth: 2,
        borderRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.raw} rules aktif`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 12 } }
        },
        y: {
          grid: { color: '#f1f5f9' },
          title: { display: true, text: 'Jumlah Rules', font: { size: 11 } },
          ticks: { precision: 0 }
        }
      }
    }
  });
}


// ──────────────────────────────────────────────
// §11  RULES TABLE
//      Sortable columns + product name search.
//      Sort is applied AFTER search filtering.
// ──────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('rules-tbody');

  // 1. Apply search query (case-insensitive, checks antecedent + consequent)
  const query = searchQuery.trim().toLowerCase();
  let rows = query
    ? filteredRules.filter(r =>
        (r.antecedent || '').toLowerCase().includes(query) ||
        (r.consequent  || '').toLowerCase().includes(query)
      )
    : [...filteredRules];

  // 2. Apply current sort
  rows.sort((a, b) => {
    let va = a[sortState.col];
    let vb = b[sortState.col];
    // For string columns, compare lexicographically
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortState.dir === 'asc' ? -1 :  1;
    if (va > vb) return sortState.dir === 'asc' ?  1 : -1;
    return 0;
  });

  // 3. Update sort icons in the header
  document.querySelectorAll('.rules-table th.sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    icon.className = 'sort-icon';          // reset
    th.classList.remove('active-sort');
    if (th.dataset.col === sortState.col) {
      th.classList.add('active-sort');
      icon.classList.add(sortState.dir);   // 'asc' or 'desc'
    }
  });

  // 4. Render rows
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">Tidak ada data yang sesuai</td></tr>';
    document.getElementById('table-count').textContent = '0 rules ditampilkan';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const sup  = parseFloat(r.support    || 0);
    const conf = parseFloat(r.confidence || 0);
    const lift = parseFloat(r.lift       || 0);

    // Colour-code lift value by strength
    const liftClass = lift >= 3 ? 'badge-lift-high' : lift >= 2 ? 'badge-lift-med' : 'badge-lift-low';

    return `<tr>
      <td class="font-medium">${r.antecedent || '—'}</td>
      <td>${r.consequent  || '—'}</td>
      <td><span class="badge badge-support">${(sup  * 100).toFixed(1)}%</span></td>
      <td><span class="badge badge-confidence">${(conf * 100).toFixed(1)}%</span></td>
      <td><span class="badge ${liftClass}">${lift.toFixed(2)}</span></td>
      <td class="text-slate-500">${r.region || '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('table-count').textContent =
    `${rows.length} rule${rows.length !== 1 ? 's' : ''} ditampilkan`;
}

/**
 * Returns a minimal Chart.js config that renders a "no data" message
 * inside the canvas.
 */
function emptyChart(message) {
  return {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: message, color: '#94a3b8', font: { size: 13 } }
      }
    }
  };
}


// ──────────────────────────────────────────────
// §12  DROPDOWN POPULATION
//      Derives unique category / region values
//      from rules.csv (not orders.csv)
// ──────────────────────────────────────────────

function populateDropdowns() {
  const categories = new Set();
  const regions    = new Set();

  RAW.rules.forEach(r => {
    if (r.category_antecedent) categories.add(r.category_antecedent);
    if (r.category_consequent)  categories.add(r.category_consequent);
    if (r.region)               regions.add(r.region);
  });

  const catSelect = document.getElementById('filter-category');
  const regSelect = document.getElementById('filter-region');

  [...categories].sort().forEach(cat => {
    catSelect.insertAdjacentHTML('beforeend', `<option value="${cat}">${cat}</option>`);
  });

  [...regions].sort().forEach(reg => {
    regSelect.insertAdjacentHTML('beforeend', `<option value="${reg}">${reg}</option>`);
  });
}


// ──────────────────────────────────────────────
// §13  EVENT BINDING
//      Wires up sliders, dropdowns, table sort,
//      search input, reset button, and info modals.
// ──────────────────────────────────────────────

function bindEvents() {

  // ── Sliders: update displayed value label + re-filter on input ──
  const sliders = [
    { id: 'filter-support',    display: 'val-support',    decimals: 2 },
    { id: 'filter-confidence', display: 'val-confidence', decimals: 2 },
    { id: 'filter-lift',       display: 'val-lift',       decimals: 1 }
  ];
  sliders.forEach(({ id, display, decimals }) => {
    const el  = document.getElementById(id);
    const val = document.getElementById(display);
    el.addEventListener('input', () => {
      val.textContent = parseFloat(el.value).toFixed(decimals);
      applyFilters();                   // ← re-derive filteredRules and redraw
    });
  });

  // ── Dropdowns ──
  ['filter-category', 'filter-region'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  // ── Table sort: click on sortable th headers ──
  document.querySelectorAll('.rules-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState.col === col) {
        // Toggle direction
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        // Numeric cols default desc, string cols default asc
        sortState.dir = ['support','confidence','lift'].includes(col) ? 'desc' : 'asc';
      }
      renderTable();
    });
  });

  // ── Table search ──
  document.getElementById('table-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderTable();
  });

  // ── Reset button ──
  document.getElementById('btn-reset').addEventListener('click', () => {
    document.getElementById('filter-support').value    = 0;
    document.getElementById('filter-confidence').value = 0;
    document.getElementById('filter-lift').value       = 0;
    document.getElementById('filter-category').value   = '';
    document.getElementById('filter-region').value     = '';

    document.getElementById('val-support').textContent    = '0.00';
    document.getElementById('val-confidence').textContent = '0.00';
    document.getElementById('val-lift').textContent       = '0.0';

    searchQuery = '';
    document.getElementById('table-search').value = '';

    applyFilters();
  });

  // ── Tooltip / info modal ──
  const modal     = document.getElementById('tooltip-modal');
  const closeBtn  = document.getElementById('tooltip-close');
  const tipTitle  = document.getElementById('tooltip-title');
  const tipBody   = document.getElementById('tooltip-body');

  function openModal(tipKey) {
    const tip = TIPS[tipKey];
    if (!tip) return;
    tipTitle.textContent = tip.title;
    tipBody.textContent  = tip.body;
    modal.classList.remove('hidden');
  }

  // All info buttons (both .info-btn and .info-btn-white) have data-tip attribute
  document.addEventListener('click', (e) => {
    if (e.target.matches('.info-btn, .info-btn-white')) {
      openModal(e.target.dataset.tip);
    }
  });

  // Close modal on button or overlay click
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.classList.add('hidden');
  });
}


// ──────────────────────────────────────────────
// §14  RAW DATA VIEWER
//      Tab switching, paginated table, search,
//      and CSV download link rendering.
// ──────────────────────────────────────────────

/**
 * Returns the dataset rows for the currently active tab,
 * filtered by rawSearch (case-insensitive across all columns).
 */
function getRawRows() {
  const dataset = rawActiveTab === 'orders' ? RAW.orders : RAW.rules;
  if (!rawSearch) return dataset;
  const q = rawSearch.toLowerCase();
  return dataset.filter(row =>
    Object.values(row).some(v => String(v).toLowerCase().includes(q))
  );
}

/**
 * Updates the badge counts on the two tab buttons.
 * Shows total row count for each dataset.
 */
function updateTabCounts() {
  document.getElementById('tab-orders-count').textContent = RAW.orders.length;
  document.getElementById('tab-rules-count').textContent  = RAW.rules.length;
}

/**
 * Renders (or re-renders) the raw data table for the active tab.
 * Builds a dynamic header from the first row's keys,
 * then renders RAW_PAGE_SIZE rows for the current page.
 *
 * Flow: tab change / search / page change → rawPage reset if needed → renderRawTable()
 */
function renderRawTable() {
  const rows    = getRawRows();
  const total   = rows.length;
  const maxPage = Math.max(0, Math.ceil(total / RAW_PAGE_SIZE) - 1);

  // Clamp page in case rows shrank after a search
  if (rawPage > maxPage) rawPage = maxPage;

  const start   = rawPage * RAW_PAGE_SIZE;
  const end     = Math.min(start + RAW_PAGE_SIZE, total);
  const slice   = rows.slice(start, end);

  const thead = document.getElementById('raw-thead');
  const tbody = document.getElementById('raw-tbody');
  const info  = document.getElementById('raw-info');

  // ── Build header from dataset keys ──
  const keys = (rawActiveTab === 'orders' ? RAW.orders : RAW.rules).length > 0
    ? Object.keys(rawActiveTab === 'orders' ? RAW.orders[0] : RAW.rules[0])
    : [];

  // Render original (display) column headers — convert underscores back to spaces, title-case
  const displayKey = k => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  thead.innerHTML = `<tr>${keys.map(k =>
    `<th class="raw-th">${displayKey(k)}</th>`
  ).join('')}</tr>`;

  // ── Render rows ──
  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${keys.length || 1}"
      class="text-center py-10 text-slate-400">Tidak ada data yang sesuai</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(row => {
      const cells = keys.map(k => {
        const val = row[k] ?? '—';
        // Highlight numeric metric columns with light badges in rules table
        if (rawActiveTab === 'rules') {
          if (k === 'support')    return `<td><span class="badge badge-support">${(+val * 100).toFixed(1)}%</span></td>`;
          if (k === 'confidence') return `<td><span class="badge badge-confidence">${(+val * 100).toFixed(1)}%</span></td>`;
          if (k === 'lift') {
            const cls = +val >= 3 ? 'badge-lift-high' : +val >= 2 ? 'badge-lift-med' : 'badge-lift-low';
            return `<td><span class="badge ${cls}">${(+val).toFixed(2)}</span></td>`;
          }
        }
        return `<td class="raw-td">${val}</td>`;
      }).join('');
      return `<tr class="raw-row">${cells}</tr>`;
    }).join('');
  }

  // ── Info line ──
  const showing = total === 0 ? '0' : `${start + 1}–${end}`;
  info.textContent = `Menampilkan ${showing} dari ${total} baris`;

  // ── Pagination controls ──
  const totalPages = Math.ceil(total / RAW_PAGE_SIZE) || 1;
  const prevBtn    = document.getElementById('raw-prev');
  const nextBtn    = document.getElementById('raw-next');
  const pageNums   = document.getElementById('raw-page-nums');

  prevBtn.disabled = rawPage === 0;
  nextBtn.disabled = rawPage >= totalPages - 1;

  // Render page number buttons (show up to 7, with ellipsis logic)
  const pages = buildPageList(rawPage, totalPages);
  pageNums.innerHTML = pages.map(p =>
    p === '…'
      ? `<span class="raw-page-ellipsis">…</span>`
      : `<button class="raw-page-num ${p === rawPage ? 'raw-page-num--active' : ''}"
           data-page="${p}">${p + 1}</button>`
  ).join('');
}

/**
 * Builds a compact list of page indices to display,
 * always showing first, last, current ±1, with '…' gaps.
 * @param {number} cur   - current 0-based page
 * @param {number} total - total page count
 * @returns {Array<number|string>}
 */
function buildPageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, cur]);
  if (cur > 0) set.add(cur - 1);
  if (cur < total - 1) set.add(cur + 1);
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

/**
 * Binds all events specific to the raw data viewer:
 * tab clicks, search input, prev/next buttons, page number clicks.
 */
function bindRawDataEvents() {

  // ── Tab switcher ──
  document.querySelectorAll('.raw-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      rawActiveTab = btn.dataset.tab;
      rawSearch    = '';
      rawPage      = 0;
      // Update tab active state visually
      document.querySelectorAll('.raw-tab').forEach(t => {
        t.classList.toggle('raw-tab--active', t === btn);
        t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
      });
      // Clear search input to match reset state
      document.getElementById('raw-search').value = '';
      renderRawTable();
    });
  });

  // ── Search ──
  document.getElementById('raw-search').addEventListener('input', (e) => {
    rawSearch = e.target.value;
    rawPage   = 0;           // reset to first page on new search
    renderRawTable();
  });

  // ── Prev / Next ──
  document.getElementById('raw-prev').addEventListener('click', () => {
    if (rawPage > 0) { rawPage--; renderRawTable(); }
  });
  document.getElementById('raw-next').addEventListener('click', () => {
    const total = Math.ceil(getRawRows().length / RAW_PAGE_SIZE);
    if (rawPage < total - 1) { rawPage++; renderRawTable(); }
  });

  // ── Page number buttons (delegated) ──
  document.getElementById('raw-page-nums').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn) {
      rawPage = parseInt(btn.dataset.page, 10);
      renderRawTable();
    }
  });
}


// ──────────────────────────────────────────────
// §15  BOOTSTRAP
//      Start the application when the DOM is ready.
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
