/*
 * התפתחות מלאי מוצרים מושמשים -- PUBLIC display for inventory_summary.json
 * (built by app/build_inventory_public.py from the local-only full data).
 *
 * One screen only: מבט על לפי מיקום המחסן -- one row per warehouse location,
 * deliberately NO combined total and no drill-down (location rows only).
 * Fully decoupled from dashboard_data.json / returns_data.json: its own fetch,
 * its own error banner -- a failure here never affects the other sections.
 */
(function () {
  'use strict';

  var COLS = [
    { key: 'location', label: 'מיקום המחסן', type: 'text' },
    { key: 'opening', label: 'יתרת פתיחה', type: 'num' },
    { key: 'issued', label: 'ניפוק בפועל', type: 'num' },
    { key: 'inflow', label: 'כניסה למלאי', type: 'num' },
    { key: 'closing', label: 'יתרת סגירה', type: 'num' },
    { key: 'change', label: 'שינוי בכמות', type: 'change' },
    { key: 'changePct', label: 'שינוי באחוזים', type: 'pct' }
  ];
  var PCT_NA = 'לא ניתן לחישוב';
  var NUM_FMT = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });

  // Business colouring (approved 2026-11-01): the goal is to REDUCE used-goods
  // stock at יסודות, so there a decrease is green and an increase red. At every
  // other location changes are neutral. The colour follows the stock direction
  // (row.change) for both change cells -- so a % on a negative opening balance
  // is still coloured correctly; arrows and values are unchanged.
  var REDUCTION_TARGET_LOCATION = 'יסודות';

  function isNumericType(type) { return type === 'num' || type === 'change' || type === 'pct'; }

  // Numeric columns sort numerically; a missing % (opening 0) always goes last,
  // in both directions. Text columns use Hebrew collation.
  function compareRows(a, b, col, dir) {
    var va = a[col.key], vb = b[col.key];
    if (isNumericType(col.type)) {
      var na = (va === null || va === undefined), nb = (vb === null || vb === undefined);
      if (na || nb) return na === nb ? 0 : (na ? 1 : -1);
      return (va - vb) * dir;
    }
    return String(va || '').localeCompare(String(vb || ''), 'he', { numeric: true, sensitivity: 'base' }) * dir;
  }

  function fmtNum(v) { return NUM_FMT.format(v); }

  function signed(v, suffix) {
    return (v > 0 ? '+' : '') + fmtNum(v) + (suffix || '');
  }

  function changeClass(row) {
    var d = row.change;
    if (!d) return 'inv-flat';
    if (row.location !== REDUCTION_TARGET_LOCATION) return 'inv-neutral';
    return d < 0 ? 'inv-good' : 'inv-bad';
  }

  // ===== DOM =====
  var section = document.getElementById('inventory');
  if (!section) return;

  var el = {
    banner: document.getElementById('invBanner'),
    meta: document.getElementById('invMeta'),
    head: document.getElementById('invHead'),
    body: document.getElementById('invBody')
  };
  var data = null;
  var sort = { key: null, dir: 1 };   // null = fixed source order (יסודות, אוברסיז, יד בנימין)

  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function valueCell(row, col) {
    var v = row[col.key];
    var td = make('td');
    if (col.type === 'num') {
      td.className = 'num';
      td.textContent = fmtNum(v);
    } else if (col.type === 'change' || col.type === 'pct') {
      td.className = 'num';
      if (col.type === 'pct' && (v === null || v === undefined)) {
        td.classList.add('inv-na');
        td.textContent = PCT_NA;
        td.title = 'יתרת הפתיחה היא 0 — לא ניתן לחשב אחוז שינוי';
        return td;
      }
      var arrow = v > 0 ? '▲ ' : v < 0 ? '▼ ' : '';
      td.classList.add(changeClass(row));
      td.textContent = arrow + signed(v, col.type === 'pct' ? '%' : '');
    } else {
      td.appendChild(make('bdi', null, v || ''));
    }
    return td;
  }

  function renderHead() {
    el.head.textContent = '';
    var tr = make('tr');
    COLS.forEach(function (col) {
      var th = make('th', 'inv-sortable', col.label);
      th.dataset.key = col.key;
      th.setAttribute('role', 'button');
      th.tabIndex = 0;
      th.title = 'מיון לפי ' + col.label;
      if (sort.key === col.key) {
        th.appendChild(make('span', 'inv-sort-ind', sort.dir === 1 ? ' ▲' : ' ▼'));
        th.setAttribute('aria-sort', sort.dir === 1 ? 'ascending' : 'descending');
      }
      var onSort = function () {
        if (sort.key === col.key) sort.dir = -sort.dir;
        else { sort.key = col.key; sort.dir = isNumericType(col.type) ? -1 : 1; }
        render();
      };
      th.addEventListener('click', onSort);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(); } });
      tr.appendChild(th);
    });
    el.head.appendChild(tr);
  }

  function render() {
    el.meta.textContent = 'נתונים מצטברים מ-' + data.periodStart + ' ועד מועד הפקת הנתונים';
    renderHead();
    var rows = data.locations.slice();
    if (sort.key) {
      var col = COLS.filter(function (c) { return c.key === sort.key; })[0];
      rows.sort(function (a, b) { return compareRows(a, b, col, sort.dir); });
    }
    el.body.textContent = '';
    rows.forEach(function (row) {
      var tr = make('tr');
      COLS.forEach(function (c) { tr.appendChild(valueCell(row, c)); });
      el.body.appendChild(tr);
    });
  }

  function showError(msg) {
    el.banner.className = 'status-banner status-bad';
    el.banner.textContent = msg;
  }

  fetch('inventory_summary.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (json) {
      if (!json || !Array.isArray(json.locations) || !json.locations.length) throw new Error('אין נתוני מיקומי מחסן בקובץ');
      data = json;
      render();
    })
    .catch(function (err) {
      showError('לא ניתן היה לטעון את סיכומי המלאי (inventory_summary.json חסר או שגוי): ' + err.message);
    });
})();
