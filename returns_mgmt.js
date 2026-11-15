/*
 * Management view of the "סיכום החזרות והחלפות" tab (DOM prefix retSummary): two selectors that
 * drive EVERY figure, table, detail list and export of the tab --
 *   logistics provider: both (default) / מוניטין / מחלב
 *   period, by ORDER (opening) date: all (default) / before 01/10/2026 / from 01/10/2026 / compare
 * The figures describe the orders that are OPEN NOW, split by the date they were opened; this is
 * not a historical performance measurement. The SLA definition is untouched: every SLA value goes
 * through RETURNS_SLA.slaOf (returns_sla.js), tracked statuses through RETURNS_STAGES.
 * An order without a valid order date belongs to "all" only (counted in a note, never in a period).
 *
 * Default state (both providers, all periods, nothing clicked) renders the tab's figures, tables,
 * detail and breadcrumb exactly as before. Other tabs do not use this file.
 *
 * Filter dimensions, all combined:  provider selector + period (or the period clicked in compare
 * mode) -> row (provider | responsibility | status, one at a time, as before) + cell provider +
 * order type -> tracked status -> SLA.  A click on a NUMBER (card, card line, compare-table cell)
 * shows exactly the orders behind that number: it sets the dimensions the number is defined by and
 * clears the ones the number does not depend on; clicking the same number again clears them.
 * A click on a table ROW (label) only replaces the row selection and keeps the rest, as before.
 *
 * The full responsibility table (normal mode, both views) is drawn by the existing code; every number
 * cell is then made clickable here (order type / action type / SLA / provider columns, totals row).
 *
 * Depends on helpers defined in index.html (called at data-load time): orderDateKey, escAttr,
 * buildResponsibilityActionMatrix, RETURNS_ACTION_TYPES, RETURNS_ACTION_OTHER, RETURNS_ORDER_GROUPS, slaOfOrder,
 * combineProviderOrders, countByProvider, renderProviderComparisonTable, renderResponsibilityActionTable,
 * renderResponsibilityRowsTable, groupOrdersByStatusByProvider, renderStatusByProviderTable,
 * renderReturnsDetail, renderSlaBlock, setSlaScope, stageMatches, stageLabel, slaMatches, slaLabel,
 * setupReturnsSummaryTab (empty-data fallback), exportReturnsToExcel.
 */
var RETURNS_MGMT = (function () {
  'use strict';
  var FROM_KEY = '20261001';
  var PROVIDERS = ['מחלב', 'מוניטין'];
  var PER = { before: 'לפני 01/10/2026', from: 'מ-01/10/2026' };
  var PER_SHORT = { before: 'לפני 01/10', from: 'מ-01/10' };
  var PER_FILE = { before: 'לפני-01-10-2026', from: 'מ-01-10-2026' };
  var NO_DATE_TEXT = 'ללא תאריך פתיחה תקין';
  var PERIOD_OPTS = [
    { key: 'all', label: 'הכול יחד' }, { key: 'before', label: 'לפני התהליך' },
    { key: 'from', label: 'מהתהליך החדש' }, { key: 'compare', label: 'השוואה' }];
  var PROV_OPTS = [{ key: 'all', label: 'מוניטין ומחלב יחד' }, { key: 'מוניטין', label: 'מוניטין בלבד' }, { key: 'מחלב', label: 'מחלב בלבד' }];
  var OTYPE_LABEL = { '015': 'החזרות 015', '102': 'החלפות 102' };
  var ROW_LABEL = { provider: 'ספק', responsibility: 'גורם אחראי', status: 'סטטוס' };

  // Same order-date parsing as the "מ-01/10/2026" tab (orderDateKey, DD/MM/YYYY only).
  function periodOf(o) {
    var k = orderDateKey(o);
    return k === null ? null : (k >= FROM_KEY ? 'from' : 'before');
  }
  function periodText(o) { var p = periodOf(o); return p ? PER[p] : NO_DATE_TEXT; }
  function inPeriod(list, p) {
    if (p === 'all') return list;
    if (p === 'both') return list.filter(function (o) { return periodOf(o) !== null; });
    return list.filter(function (o) { return periodOf(o) === p; });
  }
  var h = function (v) { return escAttr(v); };   // HTML-escape (text and attributes)

  function setup(providers) {
    var P = 'retSummary';
    var $ = function (s) { return document.getElementById(P + s); };
    if (!providers['מחלב'] && !providers['מוניטין']) { setupReturnsSummaryTab(providers); return; }

    var section = document.getElementById('returns-summary');
    var all = combineProviderOrders(providers);
    var DEFAULTS = { prov: 'all', period: 'all', pick: null, row: null, cellProv: null, otype: null, action: null, stage: null, sla: null };
    var st = Object.assign({}, DEFAULTS);
    var clicks = [];
    var rowSource = null;   // which responsibility view was clicked: highlight only there (as before)
    var provTable = $('ProviderBody').closest('table');
    var statusTable = $('StatusBody').closest('table');
    var orig = { provHead: provTable.tHead.innerHTML, statusHead: statusTable.tHead.innerHTML };

    var cmp = function () { return st.period === 'compare'; };
    var isDefaultView = function () { return st.prov === 'all' && st.period === 'all'; };
    var provOrders = function () { return st.prov === 'all' ? all : all.filter(function (o) { return o.provider === st.prov; }); };
    var effP = function () { return cmp() ? (st.pick || 'both') : st.period; };
    var scope = function (p) { return inPeriod(provOrders(), p); };
    function rowMatch(row, o) {
      if (!row) return true;
      if (row.type === 'provider') return o.provider === row.value;
      if (row.type === 'responsibility') return o.responsibility === row.value;
      return o.orderStatus === row.value;
    }
    // action type as in the responsibility table: the three known values, anything else = RETURNS_ACTION_OTHER
    function actionOf(o) { return RETURNS_ACTION_TYPES.indexOf(o.actionType) >= 0 ? o.actionType : RETURNS_ACTION_OTHER; }
    function selMatch(o) {
      return rowMatch(st.row, o) && (!st.cellProv || o.provider === st.cellProv) && (!st.otype || o.orderType === st.otype)
        && (!st.action || actionOf(o) === st.action);
    }
    var sel = function (p) { return scope(p).filter(selMatch); };
    var staged = function (p) { return sel(p).filter(function (o) { return stageMatches(o, st.stage); }); };
    var current = function (p) { return staged(p).filter(function (o) { return slaMatches(o, st.sla); }); };

    // ---- clickable numbers: each carries the state it sets ("set"); see the header comment.
    function same(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
    function isOn(set) {
      var ks = Object.keys(set);
      return ks.some(function (k) { return set[k] !== null; }) && ks.every(function (k) { return same(st[k], set[k]); });
    }
    function withPick(set, p) { if (cmp()) set.pick = p; return set; }
    function ckEl(el, set, scroll) {   // same as ck() for an element rendered by the existing table code
      clicks.push({ set: set, scroll: !!scroll });
      el.dataset.ci = String(clicks.length - 1);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-pressed', String(isOn(set)));
      el.classList.add('mg-cell');
      el.classList.toggle('mg-on', isOn(set));
    }
    function ck(set, scroll) {
      clicks.push({ set: set, scroll: !!scroll });
      return ' data-ci="' + (clicks.length - 1) + '" role="button" tabindex="0" aria-pressed="' + isOn(set) + '"';
    }
    function on(set) { return isOn(set) ? ' mg-on' : ''; }
    function apply(c) {
      var turnOff = isOn(c.set);
      rowSource = null;
      Object.keys(c.set).forEach(function (k) { st[k] = turnOff ? null : c.set[k]; });
      render();
      if (c.scroll && !turnOff) $('DetailTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function fire(e) {
      var el = e.target.closest('[data-ci]');
      if (!el || !section.contains(el) || !clicks[+el.dataset.ci] || !el.getClientRects().length) return;
      e.stopPropagation();
      apply(clicks[+el.dataset.ci]);
    }
    // capture phase: a clickable number inside an existing table row is handled here and does NOT also
    // trigger the row's own click (row selection); the row label keeps the row behaviour.
    section.addEventListener('click', fire, true);
    section.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-ci]')) { e.preventDefault(); fire(e); }
    }, true);
    // Row selection from the existing (normal-mode) tables: replaces the row only, keeps the rest (as before).
    function selectRow(type, value, source) {
      st.row = { type: type, value: value };
      rowSource = source || null;
      render();
      $('DetailTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---- selectors, scope line, notes
    function renderSelectors() {
      var base = provOrders();
      var n = { all: base.length, before: inPeriod(base, 'before').length, from: inPeriod(base, 'from').length };
      $('SelProv').innerHTML = '<span class="lbl">ספק לוגיסטי:</span>' + PROV_OPTS.map(function (x) {
        return '<button type="button" class="subnav-btn' + (st.prov === x.key ? ' active' : '') + '" aria-pressed="' + (st.prov === x.key) +
          '" data-prov="' + h(x.key) + '">' + h(x.label) + '</button>';
      }).join('');
      $('SelPer').innerHTML = '<span class="lbl">תקופה (לפי תאריך פתיחת ההזמנה):</span>' + PERIOD_OPTS.map(function (x) {
        return '<button type="button" class="subnav-btn' + (st.period === x.key ? ' active' : '') + '" aria-pressed="' + (st.period === x.key) +
          '" data-period="' + x.key + '">' + h(x.label) + (x.key === 'compare' ? '' : ' <span class="cnt">(' + n[x.key] + ')</span>') + '</button>';
      }).join('');
      $('SelProv').querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          st.prov = b.dataset.prov;
          if (st.prov !== 'all') {   // a provider selection that contradicts the selector is dropped
            if (st.row && st.row.type === 'provider' && st.row.value !== st.prov) st.row = null;
            if (st.cellProv && st.cellProv !== st.prov) st.cellProv = null;
          }
          render();
        };
      });
      $('SelPer').querySelectorAll('button').forEach(function (b) {
        b.onclick = function () { st.period = b.dataset.period; st.pick = null; render(); };
      });
    }
    function periodPart() {
      if (cmp()) return st.pick ? 'תקופה: ' + PER[st.pick] : 'השוואה: שתי התקופות';
      return st.period === 'all' ? null : 'תקופה: ' + PER[st.period];
    }
    function filterParts() {   // row / cell provider / order type (the "selection")
      return [st.row ? ROW_LABEL[st.row.type] + ': ' + st.row.value : null,
        st.cellProv ? 'ספק: ' + st.cellProv : null,
        st.otype ? OTYPE_LABEL[st.otype] : null,
        st.action ? 'סוג פעולה: ' + st.action : null].filter(Boolean);
    }
    function renderScope() {
      var line = $('ScopeLine');
      line.style.display = isDefaultView() ? 'none' : '';
      var perCls = cmp() ? (st.pick ? ' mg-per-' + st.pick : ' mg-per-cmp') : (st.period === 'all' ? '' : ' mg-per-' + st.period);
      var perText = cmp() ? (st.pick ? 'השוואה — נבחרה התקופה: ' + PER[st.pick] : 'השוואה — שתי התקופות זו לצד זו')
        : (st.period === 'all' ? 'כל התקופות' : PER[st.period]);
      line.innerHTML = '<span class="mg-t">מוצג:</span><span class="mg-chip">' + h(st.prov === 'all' ? 'מוניטין ומחלב' : st.prov) + '</span>' +
        '<span class="mg-chip' + perCls + '">' + h(perText) + '</span>' +
        filterParts().concat([stageLabel(st.stage), slaLabel(st.sla)].filter(Boolean)).map(function (x) {
          return '<span class="mg-chip mg-flt">' + h(x) + '</span>';
        }).join('') +
        '<button type="button" class="subnav-btn mg-reset" id="' + P + 'ResetView">⟲ חזרה לתצוגה הכוללת</button>';
      $('ResetView').onclick = function () { st = Object.assign({}, DEFAULTS); render(); };

      var note = $('PeriodNote');
      if (st.period === 'all') { note.style.display = 'none'; }
      else {
        note.style.display = '';
        note.innerHTML = cmp()
          ? '<b>השוואה: הזמנות פתוחות שנפתחו לפני 01/10/2026 מול הזמנות פתוחות שנפתחו מ-01/10/2026.</b> ' +
            'זו תמונת מצב של ההזמנות הפתוחות כיום, מחולקת לפי תאריך פתיחתן — לא מדידת ביצועים היסטורית של תהליך שהסתיים. ' +
            'ה-SLA לפי ההגדרה הקיימת (ימי עבודה בסטטוס הנוכחי).'
          : '<b>מוצגות רק הזמנות פתוחות שנפתחו ' + (st.period === 'before' ? 'לפני 01/10/2026' : 'מ-01/10/2026 ואילך') + '.</b> ' +
            'תמונת מצב של ההזמנות הפתוחות כיום לפי תאריך פתיחתן — לא מדידת ביצועים היסטורית. ה-SLA לפי ההגדרה הקיימת.';
      }
      var noDate = provOrders().filter(function (o) { return periodOf(o) === null; }).length;
      var nd = $('NoDate');
      nd.style.display = noDate ? '' : 'none';
      nd.textContent = noDate ? noDate + ' הזמנות ' + NO_DATE_TEXT + ' — נכללות רק ב"הכול יחד" ואינן משויכות לאף תקופה.' : '';
    }

    // ---- top cards (total / 015 / 102): clickable in every mode
    function renderTop() {
      var specs = [
        { id: 'Total', cls: '', otype: null, label: st.prov === 'all' ? 'סה"כ הזמנות פתוחות (שני הספקים)' : 'סה"כ הזמנות פתוחות (' + st.prov + ')' },
        { id: 'Returns', cls: 'good', otype: '015', label: 'סה"כ החזרות (015)' },
        { id: 'Exchanges', cls: 'warn', otype: '102', label: 'סה"כ החלפות (102)' }];
      var count = function (s, p) {
        if (isDefaultView() && p === 'all') {   // as before: the figures of returns_data.json
          var key = { Total: 'total', Returns: 'returns', Exchanges: 'exchanges' }[s.id];
          return PROVIDERS.reduce(function (t, pv) { return t + ((providers[pv] || {})[key] || 0); }, 0);
        }
        return scope(p).filter(function (o) { return !s.otype || o.orderType === s.otype; }).length;
      };
      var setOf = function (s, p) { return withPick({ row: null, cellProv: null, otype: s.otype, action: null, stage: null, sla: null }, p); };
      $('TopCards').innerHTML = specs.map(function (s) {
        if (!cmp()) {
          var set = setOf(s, null);
          return '<div class="card ' + s.cls + ' mg-pick' + on(set) + '"' + ck(set) + '><div class="v" id="' + P + s.id + '">' + count(s, st.period) +
            '</div><div class="k">' + h(s.label) + '</div></div>';
        }
        return '<div class="card mg-cmp ' + s.cls + '"><div class="k">' + h(s.label) + '</div><div class="mg-halves">' +
          ['before', 'from'].map(function (p) {
            var set = setOf(s, p);
            return '<div class="mg-half' + on(set) + '"' + ck(set) + ' data-p="' + p + '"><div class="mg-hl">' + PER_SHORT[p] +
              '</div><div class="mg-hv">' + count(s, p) + '</div></div>';
          }).join('') + '</div></div>';
      }).join('');
    }

    // ---- tracked-status cards: total / within / over / compliance %, every number clickable
    // label === null: compare half (the label is in the card head); else number, label, lines -- the existing card order
    function stageBody(r, key, p, label) {
      var setN = withPick({ stage: key, sla: null }, p);
      var setS = function (k) { return withPick({ stage: key, sla: { kind: 'sla', key: k } }, p); };
      var line = function (label, value, set, cls) {
        return '<span class="mg-line' + on(set) + '"' + ck(set) + '><bdi>' + label + '</bdi>: <b class="' + cls + '">' + value + '</b></span>';
      };
      return '<div class="mg-n' + on(setN) + '"' + ck(setN) + '><span class="v stage-n">' + r.n + '</span></div>' +
        (label === null ? '' : '<div class="k">' + h(label) + '</div>') +
        '<div class="stage-sub mg-lines">' +
        line('עומדות ב-SLA', r.within, setS('within'), 'stage-within') +
        line('חורגות מ-SLA', r.over, setS('over'), 'stage-over') +
        line('עמידה ב-SLA', RETURNS_STAGES.fmtPct(r.pct), setN, 'stage-pct') +
        (r.unknown ? line('לא ידוע', r.unknown, setS('unknown'), 'stage-unknown') : '') + '</div>';
    }
    function renderStages() {
      var el = $('StageCards');
      el.classList.toggle('mg-stage-cmp', cmp());
      if (!cmp()) {
        var sum = RETURNS_STAGES.summarize(sel(st.period));
        el.innerHTML = RETURNS_STAGES.STAGES.map(function (s) {
          return '<div class="card stage-card mg-stage" data-stage="' + s.key + '">' + stageBody(sum[s.key], s.key, null, s.label) + '</div>';
        }).join('');
        return;
      }
      var sums = { before: RETURNS_STAGES.summarize(sel('before')), from: RETURNS_STAGES.summarize(sel('from')) };
      el.innerHTML = RETURNS_STAGES.STAGES.map(function (s) {
        return '<div class="card stage-card mg-stage mg-cmp" data-stage="' + s.key + '"><div class="k">' + h(s.label) + '</div><div class="mg-halves">' +
          ['before', 'from'].map(function (p) {
            return '<div class="mg-half mg-stage-half" data-p="' + p + '"><div class="mg-hl">' + PER_SHORT[p] + '</div>' + stageBody(sums[p][s.key], s.key, p, null) + '</div>';
          }).join('') + '</div></div>';
      }).join('');
    }

    // ---- SLA cards + working-days breakdown: the existing block in normal mode; halves in compare mode
    function renderSla() {
      if (!cmp()) {
        renderSlaBlock(P, staged(st.period), st.sla, function (filter) {
          st.sla = RETURNS_SLA.toggle(st.sla, filter);
          render();
        });
        return;
      }
      var sums = { before: RETURNS_SLA.summarize(staged('before')), from: RETURNS_SLA.summarize(staged('from')) };
      var anyUnknown = sums.before.sla.unknown + sums.from.sla.unknown > 0;
      var half = function (p, value, set) {
        return '<div class="mg-half' + on(set) + '"' + ck(set) + ' data-p="' + p + '"><div class="mg-hl">' + PER_SHORT[p] + '</div><div class="mg-hv">' + value + '</div></div>';
      };
      var cardHtml = function (cls, label, valueOf, filter, dataKey) {
        return '<div class="card mg-cmp ' + cls + '"' + (dataKey ? ' data-key="' + dataKey + '"' : '') + '><div class="k">' + h(label) + '</div><div class="mg-halves">' +
          ['before', 'from'].map(function (p) { return half(p, valueOf(p), withPick({ sla: filter }, p)); }).join('') + '</div></div>';
      };
      $('SlaCards').innerHTML = cardHtml('', 'סה"כ הזמנות פתוחות', function (p) { return sums[p].total; }, null, null) +
        RETURNS_SLA.SLA.filter(function (x) { return x.key !== 'unknown' || anyUnknown; }).map(function (x) {
          return cardHtml(x.cls, x.label + ' (' + x.hint + ')', function (p) { return sums[p].sla[x.key]; }, { kind: 'sla', key: x.key }, x.key);
        }).join('');
      $('SlaAging').innerHTML = RETURNS_SLA.BUCKETS.map(function (b) {
        return cardHtml(b.cls, b.label, function (p) { return sums[p].buckets[b.key]; }, { kind: 'bucket', key: b.key }, b.key);
      }).join('');
    }

    // ---- tables
    function highlightRows() {
      var mark = function (nodes, type) {
        nodes.forEach(function (n) {
          n.classList.toggle('selected-row', !!st.row && st.row.type === type && n.dataset.key === st.row.value);
        });
      };
      mark(provTable.querySelectorAll('tbody tr'), 'provider');
      var respIn = function (src) { return rowSource === null || rowSource === src ? 'responsibility' : '-'; };
      mark(document.querySelectorAll('#' + P + 'RespBody tr'), respIn('matrix'));
      mark(document.querySelectorAll('#' + P + 'RespRowsTable tbody'), respIn('rows'));
      mark(document.querySelectorAll('#' + P + 'RespCmpTable tbody tr'), 'responsibility');
      mark(statusTable.querySelectorAll('tbody tr'), 'status');
    }
    // compare-mode table: rows x (measure x period); every cell / footer cell is a clickable number,
    // the row label replaces the row selection.
    function cmpTable(table, rowType, rowHead, keys, measures) {
      var per = ['before', 'from'];
      table.tHead.innerHTML = '<tr><th rowspan="2">' + h(rowHead) + '</th>' + measures.map(function (m) {
        return '<th colspan="2" class="mg-sep ' + (m.th || '') + '">' + h(m.label) + '</th>';
      }).join('') + '</tr><tr>' + measures.map(function () {
        return per.map(function (p, i) { return '<th class="mg-th-' + p + (i === 0 ? ' mg-sep' : '') + '">' + PER_SHORT[p] + '</th>'; }).join('');
      }).join('') + '</tr>';
      var cells = function (key) {
        var row = key === null ? null : { type: rowType, value: key };
        return measures.map(function (m) {
          return per.map(function (p, i) {
            var n = scope(p).filter(function (o) { return rowMatch(row, o) && m.match(o); }).length;
            var set = withPick({ row: row, cellProv: m.cellProv || null, otype: m.otype || null, action: null, sla: m.sla || null, stage: null }, p);
            return '<td class="mg-cell' + (i === 0 ? ' mg-sep' : '') + on(set) + '"' + ck(set, true) + ' data-p="' + p + '">' + n + '</td>';
          }).join('');
        }).join('');
      };
      table.tBodies[0].innerHTML = keys.map(function (k) {
        return '<tr class="clickable-row" data-key="' + h(k) + '"><td class="mg-rowlbl"' + ck({ row: { type: rowType, value: k } }, true) + '>' + h(k) + '</td>' + cells(k) + '</tr>';
      }).join('');
      (table.tFoot || table.createTFoot()).innerHTML = keys.length ? '<tr><td>סה"כ</td>' + cells(null) + '</tr>' : '';
    }
    // Full responsibility table (normal mode, both views): every number cell -- including the totals row
    // -- shows exactly its orders: responsibility (none in the totals row) + its column's dimensions
    // (order type, action type, SLA, provider); stage and other filters are cleared.
    function wireRespCells(list) {
      var m = buildResponsibilityActionMatrix(list, null);
      var setFor = function (resp, c) {
        return { row: resp === null ? null : { type: 'responsibility', value: resp }, cellProv: c.cellProv || null,
          otype: c.otype || null, action: c.action || null, sla: c.sla || null, stage: null };
      };
      var slaColsOf = function () { return m.slaCols.map(function (c) { return { sla: { kind: 'sla', key: c.key } }; }); };
      // matrix: per group (actions..., group total), total, SLA columns, providers (both providers only)
      var cols = [];
      m.groups.forEach(function (g) {
        g.actions.forEach(function (a) { cols.push({ otype: g.code, action: a }); });
        cols.push({ otype: g.code });
      });
      cols.push({});
      cols = cols.concat(slaColsOf(), st.prov === 'all' ? PROVIDERS.map(function (pv) { return { cellProv: pv }; }) : []);
      var wireRow = function (cells, resp) {
        for (var i = 1; i < cells.length && i <= cols.length; i++) ckEl(cells[i], setFor(resp, cols[i - 1]), true);
      };
      $('RespBody').querySelectorAll('tr').forEach(function (tr) { wireRow(tr.cells, tr.dataset.key); });
      var mf = $('RespBody').closest('table').tFoot;
      if (mf && mf.rows[0]) wireRow(mf.rows[0].cells, null);
      // rows view: per order-type row -> actions..., total, SLA by type; totals row -> actions, total, SLA
      var rcols = m.actionsAll.map(function (a) { return { action: a }; }).concat([{}], slaColsOf());
      var tbl = $('RespRowsTable');
      tbl.querySelectorAll('tbody').forEach(function (tb) {
        Array.prototype.forEach.call(tb.rows, function (tr, gi) {
          var cells = Array.prototype.slice.call(tr.cells, tr.cells.length - rcols.length);
          cells.forEach(function (td, i) {
            ckEl(td, setFor(tb.dataset.key, Object.assign({ otype: RETURNS_ORDER_GROUPS[gi].code }, rcols[i])), true);
          });
        });
      });
      if (tbl.tFoot && tbl.tFoot.rows[0]) {
        var fr = tbl.tFoot.rows[0];
        Array.prototype.slice.call(fr.cells, fr.cells.length - rcols.length).forEach(function (td, i) { ckEl(td, setFor(null, rcols[i]), true); });
      }
    }
    function keysBy(field, list) {   // distinct values, most orders first (ties: first seen)
      var m = new Map();
      list.forEach(function (o) { m.set(o[field], (m.get(o[field]) || 0) + 1); });
      return Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) { return e[0]; });
    }
    function renderTables() {
      var names = st.prov === 'all' ? PROVIDERS : [st.prov];
      var viewBtns = document.querySelectorAll('#' + P + 'RespViewToggle .subnav-btn[data-view]');
      var activeView = (document.querySelector('#' + P + 'RespViewToggle .subnav-btn[data-view].active') || {}).dataset;
      if (!cmp()) {
        var list = scope(st.period);
        viewBtns.forEach(function (b) { b.style.display = ''; });
        $('RespMatrixWrap').style.display = activeView && activeView.view === 'rows' ? 'none' : '';
        $('RespRowsWrap').style.display = activeView && activeView.view === 'rows' ? '' : 'none';
        $('RespCmpWrap').style.display = 'none';
        $('RespCmpTable').tHead.innerHTML = ''; $('RespCmpTable').tBodies[0].innerHTML = '';   // no stale clickable cells
        if ($('RespCmpTable').tFoot) $('RespCmpTable').tFoot.innerHTML = '';
        provTable.tHead.innerHTML = orig.provHead;
        if (provTable.tFoot) provTable.tFoot.innerHTML = '';
        renderProviderComparisonTable($('ProviderBody'), isDefaultView() ? providers : countByProvider(list),
          function (k) { selectRow('provider', k); }, names);
        renderResponsibilityActionTable($('RespBody'), list, null, st.prov === 'all', function (k) { selectRow('responsibility', k, 'matrix'); });
        renderResponsibilityRowsTable($('RespRowsTable'), list, null, function (k) { selectRow('responsibility', k, 'rows'); });
        wireRespCells(list);
        if (statusTable.tFoot) statusTable.tFoot.innerHTML = '';
        if (st.prov === 'all') {
          statusTable.tHead.innerHTML = orig.statusHead;
          renderStatusByProviderTable($('StatusBody'), groupOrdersByStatusByProvider(list), function (k) { selectRow('status', k); });
        } else {
          statusTable.tHead.innerHTML = '<tr><th>סטטוס הזמנה</th><th>' + h(st.prov) + '</th></tr>';
          $('StatusBody').innerHTML = groupOrdersByStatusByProvider(list).map(function (r) {
            return '<tr class="clickable-row" data-key="' + h(r.status) + '"><td>' + h(r.status) + '</td><td>' + r.total + '</td></tr>';
          }).join('');
          $('StatusBody').querySelectorAll('tr').forEach(function (tr) { tr.onclick = function () { selectRow('status', tr.dataset.key); }; });
        }
      } else {
        var both = scope('both');
        var typeM = [
          { label: 'החזרות 015', otype: '015', match: function (o) { return o.orderType === '015'; } },
          { label: 'החלפות 102', otype: '102', match: function (o) { return o.orderType === '102'; } },
          { label: 'סה"כ הזמנות פתוחות', match: function () { return true; } }];
        var provM = st.prov === 'all' ? PROVIDERS.map(function (pv) {
          return { label: pv, cellProv: pv, match: function (o) { return o.provider === pv; } };
        }) : [];
        var anyUnknown = both.some(function (o) { return slaOfOrder(o) === 'unknown'; });
        var slaM = RETURNS_SLA.SLA.filter(function (x) { return x.key !== 'unknown' || anyUnknown; }).map(function (x) {
          return { label: x.label, th: 'sla-h-' + { within: 'good', over: 'bad', unknown: 'unknown' }[x.key], sla: { kind: 'sla', key: x.key },
            match: function (o) { return slaOfOrder(o) === x.key; } };
        });
        viewBtns.forEach(function (b) { b.style.display = 'none'; });
        // the hidden full tables keep the previous render's cells: make them inert (no stale click targets)
        section.querySelectorAll('#' + P + 'RespMatrixWrap [data-ci], #' + P + 'RespRowsWrap [data-ci]').forEach(function (el) {
          el.removeAttribute('data-ci'); el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('aria-pressed');
          el.classList.remove('mg-cell', 'mg-on');
        });
        $('RespMatrixWrap').style.display = 'none';
        $('RespRowsWrap').style.display = 'none';
        $('RespCmpWrap').style.display = '';
        cmpTable(provTable, 'provider', 'חברת שליחויות', names.filter(function (pv) { return both.some(function (o) { return o.provider === pv; }); }), typeM);
        cmpTable($('RespCmpTable'), 'responsibility', 'גורם אחראי', keysBy('responsibility', both), typeM.concat(slaM, provM));
        cmpTable(statusTable, 'status', 'סטטוס הזמנה', keysBy('orderStatus', both), provM.concat([{ label: 'סה"כ', match: function () { return true; } }]));
      }
      $('StatusTitle').textContent = 'פילוח לפי סטטוס הזמנה (' + (st.prov === 'all' ? 'שני הספקים' : st.prov) + ')';
      highlightRows();
    }

    // ---- detail, breadcrumb, scope labels, export
    function renderDetail() {
      var orders = current(effP());
      var parts = [st.prov === 'all' ? null : 'ספק לוגיסטי: ' + st.prov, periodPart()].filter(Boolean)
        .concat(filterParts(), [stageLabel(st.stage), slaLabel(st.sla)].filter(Boolean));
      $('DetailTitle').textContent = 'פירוט הזמנות - ' + (parts.length ? parts.join(' | ') : 'כל ההזמנות') + ' (' + orders.length + ')';
      $('Breadcrumb').textContent = ['סיכום'].concat(parts).join(' > ');
      renderReturnsDetail($('DetailBody'), orders);
      $('BackToRespTop').style.display = st.row && st.row.type === 'responsibility' ? '' : 'none';
      var scopeResp = st.row && st.row.type === 'responsibility' ? st.row.value : null;
      var extra = [st.row && st.row.type !== 'responsibility' ? ROW_LABEL[st.row.type] + ': ' + st.row.value : null,
        st.cellProv ? 'ספק: ' + st.cellProv : null, st.otype ? OTYPE_LABEL[st.otype] : null,
        st.action ? 'סוג פעולה: ' + st.action : null].filter(Boolean).join(' | ');
      setSlaScope(P + 'Stage', scopeResp, extra);
      setSlaScope(P, scopeResp, [extra, stageLabel(st.stage)].filter(Boolean).join(' | '));
      $('ExportBtn').disabled = false;
    }
    function exportParts() {
      var provider = st.row && st.row.type === 'provider' ? st.row.value : (st.cellProv || (st.prov === 'all' ? 'משולב' : st.prov));
      return {
        provider: provider,
        period: cmp() ? (st.pick ? PER_FILE[st.pick] : 'השוואה') : (st.period === 'all' ? null : PER_FILE[st.period]),
        orderType: st.otype || null,
        action: st.action || null,
        responsibility: st.row && st.row.type === 'responsibility' ? st.row.value : null,
        status: st.row && st.row.type === 'status' ? st.row.value : null,
        stage: stageLabel(st.stage) || null,
        sla: slaLabel(st.sla) || null,
        extraColumns: [{ header: 'תקופה', key: 'period', width: 16, valueOf: periodText }],
      };
    }
    $('ExportBtn').onclick = function () { exportReturnsToExcel(current(effP()), exportParts()); };
    $('ShowAll').onclick = function () {
      ['pick', 'row', 'cellProv', 'otype', 'action', 'stage', 'sla'].forEach(function (k) { st[k] = null; });
      render();
    };
    $('BackToRespTop').onclick = function () { st.row = null; render(); };

    function render() {
      clicks = [];
      renderSelectors();
      renderScope();
      renderTop();
      renderStages();
      renderSla();
      renderTables();
      renderDetail();
    }
    render();
    // read-only view of the state (tests / debugging); the page never reads it back
    api.view = { state: function () { return JSON.parse(JSON.stringify(st)); }, currentOrders: function () { return current(effP()); }, exportParts: exportParts };
  }

  var api = { setup: setup, periodOf: periodOf, periodText: periodText, FROM_KEY: FROM_KEY, view: null };
  return api;
})();
