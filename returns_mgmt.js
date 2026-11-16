/*
 * Management view of the "סיכום החזרות והחלפות" tab (DOM prefix retSummary), with ONE filter bar
 * (sticky at the top of the tab) that holds every filter of the tab:
 *   logistics provider (buttons)  -- both / מוניטין / מחלב
 *   period by ORDER (opening) date (buttons) -- all / before 01/10/2026 / from 01/10/2026 / compare
 *   responsibility, order status, order type (015/102), action type, SLA / working days (dropdowns)
 * plus a chip with "×" for every active filter, "reset all", and the number of orders shown.
 *
 * Every filter dimension is independent and they all combine (AND). All of them apply to every
 * card, table, detail list and export of the tab.
 *
 * THE RULE FOR EVERY NUMBER (cards, card lines, table cells, dropdown options, selector buttons):
 *   number = the orders that match ALL active filters, where the number's OWN values (its row / its
 *   column / its card) replace the active filter of the same dimension.
 * So a breakdown always shows all of its values (the active one highlighted), and a "סה"כ" number --
 * which has no own value in that dimension -- shows what the active filters give.
 * A click on a number sets exactly its own values and keeps every other filter; the detail list is
 * then exactly the orders behind that number. Clicking a highlighted number again removes its values.
 * A click on a row label (provider / responsibility / status) selects that row (no toggle).
 *
 * Status: the order-status filter also drives the three tracked-status cards ("בהמתנה לאיסוף",
 * "בדרך למחסן", "בטיפול קמ"ש" = order statuses, RETURNS_STAGES); there is no separate stage filter.
 * SLA: one dimension -- an SLA value or a working-days range (RETURNS_SLA filter objects); the SLA
 * definition is untouched (RETURNS_SLA.slaOf / bucketOf, returns_sla.js).
 * Period: the figures describe the orders OPEN NOW, split by the date they were opened -- not a
 * historical performance measurement. An order without a valid order date belongs to "all" only.
 * In compare mode every card / table number is split into "before" / "from" (each half is a number
 * of its own period); the detail list is grouped by period, with a period column.
 * A filter combination with no orders is shown as such; filters are never reset automatically.
 *
 * Other tabs do not use this file.
 * Depends on helpers defined in index.html: orderDateKey, escAttr, combineProviderOrders,
 * RETURNS_ACTION_TYPES, RETURNS_ACTION_OTHER, RETURNS_ORDER_GROUPS, slaOfOrder, slaMatches, slaLabel,
 * renderReturnsDetail, setSlaScope, setupReturnsSummaryTab (empty-data fallback), exportReturnsToExcel.
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
  var PROV_OPTS = [{ key: null, label: 'מוניטין ומחלב יחד' }, { key: 'מוניטין', label: 'מוניטין' }, { key: 'מחלב', label: 'מחלב' }];
  var OTYPE_LABEL = { '015': 'החזרות 015', '102': 'החלפות 102' };
  var DIMS = ['prov', 'resp', 'status', 'otype', 'action', 'sla'];
  var DIM_LABEL = { prov: 'ספק', resp: 'גורם אחראי', status: 'סטטוס הזמנה', otype: 'סוג הזמנה', action: 'סוג פעולה', sla: 'SLA / ימי עבודה' };
  var BAR_DIMS = ['resp', 'status', 'otype', 'action', 'sla'];

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
  // action type as in the responsibility table: the three known values, anything else = RETURNS_ACTION_OTHER
  function actionOf(o) { return RETURNS_ACTION_TYPES.indexOf(o.actionType) >= 0 ? o.actionType : RETURNS_ACTION_OTHER; }
  function sameSla(a, b) { return (!a && !b) || (!!a && !!b && a.kind === b.kind && a.key === b.key); }
  function sameVal(d, a, b) {
    if (d === 'sla') return sameSla(a, b);
    return (a === undefined ? null : a) === (b === undefined ? null : b);
  }
  function dimMatch(o, d, v) {
    if (v === null || v === undefined) return true;
    if (d === 'prov') return o.provider === v;
    if (d === 'resp') return o.responsibility === v;
    if (d === 'status') return o.orderStatus === v;
    if (d === 'otype') return o.orderType === v;
    if (d === 'action') return actionOf(o) === v;
    return slaMatches(o, v);
  }
  function valText(d, v) { return d === 'otype' ? OTYPE_LABEL[v] || v : d === 'sla' ? slaLabel(v) : v; }
  var slaF = function (key) { return { kind: 'sla', key: key }; };
  var h = function (v) { return escAttr(v); };   // HTML-escape (text and attributes)
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function setup(providers) {
    var P = 'retSummary';
    var $ = function (s) { return document.getElementById(P + s); };
    if (!providers['מחלב'] && !providers['מוניטין']) { setupReturnsSummaryTab(providers); return; }

    var section = document.getElementById('returns-summary');
    var all = combineProviderOrders(providers);
    var DEFAULTS = { period: 'all', pick: null, prov: null, resp: null, status: null, otype: null, action: null, sla: null };
    var st = Object.assign({}, DEFAULTS);
    var clicks = [];
    var provTable = $('ProviderBody').closest('table');
    var statusTable = $('StatusBody').closest('table');
    var matrixTable = $('RespBody').closest('table');
    var rowsTable = $('RespRowsTable');
    var orig = { provHead: provTable.tHead.innerHTML, statusHead: statusTable.tHead.innerHTML };

    var cmp = function () { return st.period === 'compare'; };
    // period of a number: its own half in compare mode, else the selected period (compare: picked or both)
    function periodFor(set) {
      if (!cmp()) return st.period;
      return (set && has(set, 'pick') ? set.pick : st.pick) || 'both';
    }
    // THE RULE (see header): all active filters, the number's own values replacing the same dimension.
    function ordersFor(set) {
      var eff = {};
      DIMS.forEach(function (d) { eff[d] = set && has(set, d) ? set[d] : st[d]; });
      return inPeriod(all, periodFor(set)).filter(function (o) {
        for (var i = 0; i < DIMS.length; i++) if (!dimMatch(o, DIMS[i], eff[DIMS[i]])) return false;
        return true;
      });
    }
    var count = function (set) { return ordersFor(set).length; };
    var current = function () { return ordersFor(null); };
    // detail order: as the data, except compare mode with both periods -> grouped "before" then "from"
    function detailOrders() {
      var list = current();
      if (!cmp() || st.pick) return list;
      return inPeriod(list, 'before').concat(inPeriod(list, 'from'));
    }
    function anyActive() { return st.period !== 'all' || DIMS.some(function (d) { return st[d] !== null; }); }

    // ---- clickable numbers: each carries the values it sets ("set")
    function isOn(set) {
      var ks = Object.keys(set);
      var own = ks.filter(function (k) { return k !== 'pick' && set[k] !== null; });
      return own.length > 0 && ks.every(function (k) {
        return k === 'pick' ? (set.pick || null) === (st.pick || null) : sameVal(k, st[k], set[k]);
      });
    }
    function reg(c) { clicks.push(c); return clicks.length - 1; }
    function attrs(ci, on) { return ' data-ci="' + ci + '" role="button" tabindex="0" aria-pressed="' + on + '"'; }
    // a number: toggles its own values; scroll -> the detail list after the click
    function ck(set, scroll) { return attrs(reg({ set: set, scroll: !!scroll }), isOn(set)); }
    // a row label: selects the row (no toggle)
    function sel(set) { return attrs(reg({ set: set, select: true, scroll: true }), isOn(set)); }
    function on(set) { return isOn(set) ? ' mg-on' : ''; }
    function apply(c) {
      var turnOff = !c.select && isOn(c.set);
      Object.keys(c.set).forEach(function (k) { st[k] = turnOff ? null : c.set[k]; });
      render();
      if (c.scroll && !turnOff) toDetail();
    }
    function fire(e) {
      var el = e.target.closest('[data-ci]');
      if (!el || !section.contains(el) || !clicks[+el.dataset.ci] || !el.getClientRects().length) return;
      e.stopPropagation();
      apply(clicks[+el.dataset.ci]);
    }
    section.addEventListener('click', fire, true);
    section.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-ci]')) { e.preventDefault(); fire(e); }
    }, true);
    function toDetail() { $('DetailTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

    // ---- sticky bar: offsets so the bar sits under the page header and never covers a scroll target
    var header = document.querySelector('header');
    function syncSticky() {
      var hh = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
      section.style.setProperty('--mg-hdr-h', Math.round(hh) + 'px');
      section.style.setProperty('--mg-fb-h', Math.round($('FilterBar').getBoundingClientRect().height) + 'px');
    }
    window.addEventListener('resize', syncSticky);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncSticky).observe($('FilterBar'));
    if (window.matchMedia && window.matchMedia('(max-width:833.98px)').matches) $('FbMore').open = false;   // phones + tablets: selectors folded
    $('FbMore').addEventListener('toggle', syncSticky);

    // ---- the filter bar
    var showUnknown = all.some(function (o) { return slaOfOrder(o) === 'unknown'; });
    var hasOther = function (code) {
      return all.some(function (o) { return (code === null || o.orderType === code) && actionOf(o) === RETURNS_ACTION_OTHER; });
    };
    var byCount = function (field) {
      var m = new Map();
      all.forEach(function (o) { m.set(o[field], (m.get(o[field]) || 0) + 1); });
      return Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) { return e[0]; });
    };
    var trackedStatuses = RETURNS_STAGES.STAGES.map(function (s) { return s.status; });
    var OPTS = {
      resp: byCount('responsibility'),
      status: trackedStatuses.concat(byCount('orderStatus').filter(function (s) { return trackedStatuses.indexOf(s) < 0; })),
      otype: ['015', '102'],
      action: RETURNS_ACTION_TYPES.concat(hasOther(null) ? [RETURNS_ACTION_OTHER] : []),
      sla: RETURNS_SLA.SLA.filter(function (x) { return x.key !== 'unknown' || showUnknown; }).map(function (x) { return slaF(x.key); })
        .concat(RETURNS_SLA.BUCKETS.map(function (b) { return { kind: 'bucket', key: b.key }; })),
    };
    var enc = function (d, v) { return v === null ? '' : d === 'sla' ? v.kind + ':' + v.key : v; };
    var dec = function (d, s) {
      if (s === '') return null;
      if (d !== 'sla') return s;
      var i = s.indexOf(':');
      return { kind: s.slice(0, i), key: s.slice(i + 1) };
    };
    function chipList() {
      var chips = [];
      if (st.prov) chips.push({ x: 'prov', t: 'ספק: ' + st.prov, c: 'fb-c-prov' });
      if (st.period !== 'all') {
        chips.push({ x: 'period', t: cmp() ? 'השוואה: לפני מול מ-01/10/2026' : 'תקופה: ' + PER[st.period], c: 'fb-c-per ' + (cmp() ? 'mg-per-cmp' : 'mg-per-' + st.period) });
        if (cmp() && st.pick) chips.push({ x: 'pick', t: 'נבחרה: ' + PER[st.pick], c: 'fb-c-per mg-per-' + st.pick });
      }
      BAR_DIMS.forEach(function (d) { if (st[d] !== null) chips.push({ x: d, t: DIM_LABEL[d] + ': ' + valText(d, st[d]), c: '' }); });
      return chips;
    }
    function renderBar() {
      $('SelProv').innerHTML = '<span class="lbl">ספק לוגיסטי:</span>' + PROV_OPTS.map(function (x) {
        var act = st.prov === x.key;
        return '<button type="button" class="subnav-btn' + (act ? ' active' : '') + '" aria-pressed="' + act + '" data-prov="' + h(x.key || 'all') + '">' +
          h(x.label) + ' <span class="cnt">(' + count({ prov: x.key }) + ')</span></button>';
      }).join('');
      var perCount = function (p) {
        return inPeriod(all, p).filter(function (o) { return DIMS.every(function (d) { return dimMatch(o, d, st[d]); }); }).length;
      };
      $('SelPer').innerHTML = '<span class="lbl">תקופה (לפי תאריך פתיחת ההזמנה):</span>' + PERIOD_OPTS.map(function (x) {
        var act = st.period === x.key;
        return '<button type="button" class="subnav-btn' + (act ? ' active' : '') + '" aria-pressed="' + act + '" data-period="' + x.key + '">' + h(x.label) +
          (x.key === 'compare' ? '' : ' <span class="cnt">(' + perCount(x.key) + ')</span>') + '</button>';
      }).join('');
      $('SelProv').querySelectorAll('button').forEach(function (b) {
        b.onclick = function () { st.prov = b.dataset.prov === 'all' ? null : b.dataset.prov; render(); };
      });
      $('SelPer').querySelectorAll('button').forEach(function (b) {
        b.onclick = function () { st.period = b.dataset.period; st.pick = null; render(); };
      });

      $('FbSel').innerHTML = BAR_DIMS.map(function (d) {
        var o = OPTS[d].map(function (v) {
          var sep = d === 'sla' && v.kind === 'bucket' && v.key === RETURNS_SLA.BUCKETS[0].key ? '<option disabled>── ימי עבודה בסטטוס ──</option>' : '';
          var txt = (d === 'status' && trackedStatuses.indexOf(v) >= 0 ? '★ ' : '') + valText(d, v);
          var set = {}; set[d] = v;
          return sep + '<option value="' + h(enc(d, v)) + '"' + (sameVal(d, st[d], v) ? ' selected' : '') + '>' + h(txt) + ' (' + count(set) + ')</option>';
        }).join('');
        var none = {}; none[d] = null;
        return '<label class="fb-field"><span>' + h(DIM_LABEL[d]) + '</span><select data-dim="' + d + '" class="' + (st[d] !== null ? 'fb-on' : '') + '">' +
          '<option value="">הכול (' + count(none) + ')</option>' + o + '</select></label>';
      }).join('');
      $('FbSel').querySelectorAll('select').forEach(function (s) {
        s.onchange = function () { st[s.dataset.dim] = dec(s.dataset.dim, s.value); render(); };
      });

      var n = current().length;
      var cnt = $('FbCount');
      cnt.classList.toggle('fb-zero', n === 0);
      cnt.textContent = n === 0 ? 'אין הזמנות שתואמות את שילוב הסינונים (0)' :
        'מוצגות ' + n + ' הזמנות' + (anyActive() ? ' (מתוך ' + all.length + ' פתוחות)' : ' (כל ההזמנות הפתוחות)');
      var chips = chipList();
      $('FbChips').innerHTML = chips.length ? chips.map(function (c) {
        return '<span class="fb-chip ' + c.c + '">' + h(c.t) + '<button type="button" class="fb-x" data-x="' + c.x + '" aria-label="הסרת הסינון ' + h(c.t) + '" title="הסרת הסינון">×</button></span>';
      }).join('') : '<span class="fb-none">אין סינון פעיל</span>';
      $('FbChips').querySelectorAll('[data-x]').forEach(function (b) {
        b.onclick = function () {
          var x = b.dataset.x;
          if (x === 'period') { st.period = 'all'; st.pick = null; } else st[x] = null;
          render();
        };
      });
      $('ResetView').disabled = !anyActive();
      $('FbEmpty').hidden = n !== 0;
      $('FbSum').textContent = 'סינון' + (chips.length ? ' (' + chips.length + ' פעילים)' : '') + ' — הקישו לפתיחה / סגירה של הבוררים';
    }
    $('ResetView').onclick = function () { st = Object.assign({}, DEFAULTS); render(); };
    $('FbToDetail').onclick = toDetail;

    function renderNotes() {
      var note = $('PeriodNote');
      if (st.period === 'all') { note.style.display = 'none'; }
      else {
        note.style.display = '';
        note.innerHTML = cmp()
          ? '<b>השוואה: הזמנות פתוחות שנפתחו לפני 01/10/2026 מול הזמנות פתוחות שנפתחו מ-01/10/2026.</b> ' +
            'זו תמונת מצב של ההזמנות הפתוחות כיום, מחולקת לפי תאריך פתיחתן — לא מדידת ביצועים היסטורית של תהליך שהסתיים. ' +
            'ה-SLA לפי ההגדרה הקיימת (ימי עבודה בסטטוס הנוכחי). כל הסינונים חלים על שתי התקופות.'
          : '<b>מוצגות רק הזמנות פתוחות שנפתחו ' + (st.period === 'before' ? 'לפני 01/10/2026' : 'מ-01/10/2026 ואילך') + '.</b> ' +
            'תמונת מצב של ההזמנות הפתוחות כיום לפי תאריך פתיחתן — לא מדידת ביצועים היסטורית. ה-SLA לפי ההגדרה הקיימת.';
      }
      var noDate = all.filter(function (o) { return periodOf(o) === null; }).length;
      var nd = $('NoDate');
      nd.style.display = noDate ? '' : 'none';
      nd.textContent = noDate ? noDate + ' הזמנות ' + NO_DATE_TEXT + ' — נכללות רק ב"הכול יחד" ואינן משויכות לאף תקופה.' : '';
    }

    // ---- cards. compare mode: every card split into two clickable halves (each a number of its period)
    function numCard(cls, label, set, extra) {
      if (!cmp()) {
        return '<div class="card ' + cls + ' mg-pick' + on(set) + '"' + (extra || '') + ck(set) + '><div class="v">' + count(set) +
          '</div><div class="k">' + h(label) + '</div></div>';
      }
      return '<div class="card mg-cmp ' + cls + '"' + (extra || '') + '><div class="k">' + h(label) + '</div><div class="mg-halves">' +
        ['before', 'from'].map(function (p) {
          var s = Object.assign({}, set, { pick: p });
          return '<div class="mg-half' + on(s) + '"' + ck(s) + ' data-p="' + p + '"><div class="mg-hl">' + PER_SHORT[p] + '</div><div class="mg-hv">' + count(s) + '</div></div>';
        }).join('') + '</div></div>';
    }
    function renderTop() {
      $('TopCards').innerHTML =
        numCard('', st.prov ? 'סה"כ הזמנות פתוחות (' + st.prov + ')' : 'סה"כ הזמנות פתוחות (שני הספקים)', {}, ' data-top="total"') +
        numCard('good', 'סה"כ החזרות (015)', { otype: '015' }, ' data-top="015"') +
        numCard('warn', 'סה"כ החלפות (102)', { otype: '102' }, ' data-top="102"');
    }
    // tracked-status card body: total / within / over / compliance % (+ unknown), every number clickable
    function stageBody(s, pick, withLabel) {
      var P2 = pick ? { pick: pick } : {};
      var tot = Object.assign({ status: s.status }, P2);
      var bySla = function (k) { return Object.assign({ status: s.status, sla: slaF(k) }, P2); };
      var n = count(tot), w = count(bySla('within')), ov = count(bySla('over')), un = count(bySla('unknown'));
      var pct = w + ov ? (100 * w) / (w + ov) : null;
      var line = function (label, value, set, cls) {
        return '<span class="mg-line' + on(set) + '"' + ck(set) + '><bdi>' + label + '</bdi>: <b class="' + cls + '">' + value + '</b></span>';
      };
      return '<div class="mg-n' + on(tot) + '"' + ck(tot) + '><span class="v stage-n">' + n + '</span></div>' +
        (withLabel ? '<div class="k">' + h(s.label) + '</div>' : '') +
        '<div class="stage-sub mg-lines">' +
        line('עומדות ב-SLA', w, bySla('within'), 'stage-within') +
        line('חורגות מ-SLA', ov, bySla('over'), 'stage-over') +
        line('עמידה ב-SLA', RETURNS_STAGES.fmtPct(pct), tot, 'stage-pct') +
        (un ? line('לא ידוע', un, bySla('unknown'), 'stage-unknown') : '') + '</div>';
    }
    function renderStages() {
      var el = $('StageCards');
      el.classList.toggle('mg-stage-cmp', cmp());
      el.innerHTML = RETURNS_STAGES.STAGES.map(function (s) {
        var act = st.status === s.status ? ' mg-stage-on' : '';
        if (!cmp()) return '<div class="card stage-card mg-stage' + act + '" data-stage="' + s.key + '">' + stageBody(s, null, true) + '</div>';
        return '<div class="card stage-card mg-stage mg-cmp' + act + '" data-stage="' + s.key + '"><div class="k">' + h(s.label) + '</div><div class="mg-halves">' +
          ['before', 'from'].map(function (p) {
            return '<div class="mg-half mg-stage-half" data-p="' + p + '"><div class="mg-hl">' + PER_SHORT[p] + '</div>' + stageBody(s, p, false) + '</div>';
          }).join('') + '</div></div>';
      }).join('');
    }
    function renderSla() {
      $('SlaCards').innerHTML = numCard('', 'סה"כ הזמנות פתוחות', {}, ' data-kind="total"') +
        RETURNS_SLA.SLA.filter(function (x) { return x.key !== 'unknown' || showUnknown; }).map(function (x) {
          return numCard(x.cls, x.label + ' (' + x.hint + ')', { sla: slaF(x.key) }, ' data-kind="sla" data-key="' + x.key + '"');
        }).join('');
      $('SlaAging').innerHTML = RETURNS_SLA.BUCKETS.map(function (b) {
        return numCard(b.cls, b.label, { sla: { kind: 'bucket', key: b.key } }, ' data-kind="bucket" data-key="' + b.key + '"');
      }).join('');
    }

    // ---- tables
    // rows of a breakdown: every value of the dimension with orders in AT LEAST ONE cell of its row --
    // i.e. under the other filters, ignoring the dimensions the table's columns replace (colDims; in
    // compare mode also the period half) -- most first, plus the selected value (a selection never
    // disappears, even with 0 orders). So every footer cell == the sum of the rows shown.
    function rowKeys(dim, field, colDims) {
      var none = {}; none[dim] = null;
      (colDims || []).forEach(function (d) { none[d] = null; });
      if (cmp()) none.pick = null;
      var m = new Map();
      ordersFor(none).forEach(function (o) { m.set(o[field], (m.get(o[field]) || 0) + 1); });
      var keys = Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) { return e[0]; });
      if (st[dim] !== null && keys.indexOf(st[dim]) < 0) keys.push(st[dim]);
      if (dim === 'prov') keys = PROVIDERS.filter(function (k) { return keys.indexOf(k) >= 0; });   // fixed order, as before
      return keys;
    }
    function withRow(dim, key, set) { var s = Object.assign({}, set); if (key !== null) s[dim] = key; return s; }
    var emptyRow = function (cols) { return '<tr class="mg-empty-row"><td colspan="' + cols + '">אין הזמנות לשילוב הסינונים הנוכחי</td></tr>'; };
    function cell(set, cls, fmt, extra) {
      var n = count(set);
      return '<td class="mg-cell' + (cls ? ' ' + cls : '') + on(set) + '"' + (extra || '') + ck(set, true) + '>' + (fmt ? fmt(n) : n) + '</td>';
    }
    var selCls = function (dim, key) { return st[dim] !== null && st[dim] === key ? ' selected-row' : ''; };
    var slaCols = [{ key: 'within', label: 'Within SLA', cls: 'sla-h-good' }, { key: 'over', label: 'Over SLA', cls: 'sla-h-bad' }]
      .concat(showUnknown ? [{ key: 'unknown', label: 'לא ידוע', cls: 'sla-h-unknown' }] : []);
    var groups = RETURNS_ORDER_GROUPS.map(function (g) {
      return Object.assign({}, g, { actions: RETURNS_ACTION_TYPES.concat(hasOther(g.code) ? [RETURNS_ACTION_OTHER] : []) });
    });
    var actionsAll = OPTS.action;
    var RESP_COLS = ['otype', 'action', 'sla', 'prov'];   // dimensions the responsibility tables' columns replace

    function renderProviderTable() {
      provTable.tHead.innerHTML = orig.provHead;
      if (provTable.tFoot) provTable.tFoot.innerHTML = '';
      var keys = rowKeys('prov', 'provider', ['otype']);
      $('ProviderBody').innerHTML = keys.length ? keys.map(function (k) {
        return '<tr class="clickable-row' + selCls('prov', k) + '" data-key="' + h(k) + '"><td class="mg-rowlbl"' + sel({ prov: k }) + '>' + h(k) + '</td>' +
          cell({ prov: k, otype: '015' }) + cell({ prov: k, otype: '102' }) + cell({ prov: k }) + '</tr>';
      }).join('') : emptyRow(4);
    }
    // full responsibility table, "פילוח אופקי": same columns as the shared table (order-type groups x
    // action types, total, SLA, providers); every number cell follows THE RULE
    function renderMatrix() {
      matrixTable.tHead.innerHTML =
        '<tr><th rowspan="2">גורם אחראי</th>' +
        groups.map(function (g) { return '<th colspan="' + (g.actions.length + 1) + '" class="grp-start">' + h(g.label) + '</th>'; }).join('') +
        '<th rowspan="2" class="grp-start">סה"כ הזמנות פתוחות</th>' +
        '<th colspan="' + slaCols.length + '" class="grp-start">SLA (ימי עבודה בסטטוס)</th>' +
        '<th rowspan="2" class="grp-start">מחלב</th><th rowspan="2">מוניטין</th></tr>' +
        '<tr>' + groups.map(function (g) {
          return g.actions.map(function (a, i) { return '<th' + (i === 0 ? ' class="grp-start"' : '') + '>' + h(a) + '</th>'; }).join('') + '<th>' + h(g.totalLabel) + '</th>';
        }).join('') + slaCols.map(function (c, i) { return '<th class="' + c.cls + (i === 0 ? ' grp-start' : '') + '">' + h(c.label) + '</th>'; }).join('') + '</tr>';
      var cellsOf = function (k) {
        var R = function (set) { return withRow('resp', k, set); };
        return groups.map(function (g) {
          return g.actions.map(function (a, i) { return cell(R({ otype: g.code, action: a }), i === 0 ? 'grp-start' : ''); }).join('') +
            cell(R({ otype: g.code }), 'grp-total');
        }).join('') + cell(R({}), 'grp-start grp-total') +
          slaCols.map(function (c, i) { return cell(R({ sla: slaF(c.key) }), i === 0 ? 'grp-start' : ''); }).join('') +
          cell(R({ prov: 'מחלב' }), 'grp-start') + cell(R({ prov: 'מוניטין' }));
      };
      var keys = rowKeys('resp', 'responsibility', RESP_COLS);
      var ncols = 1 + groups.reduce(function (t, g) { return t + g.actions.length + 1; }, 0) + 1 + slaCols.length + 2;
      $('RespBody').innerHTML = keys.length ? keys.map(function (k) {
        return '<tr class="clickable-row' + selCls('resp', k) + '" data-key="' + h(k) + '"><td class="mg-rowlbl"' + sel({ resp: k }) + '>' + h(k) + '</td>' + cellsOf(k) + '</tr>';
      }).join('') : emptyRow(ncols);
      (matrixTable.tFoot || matrixTable.createTFoot()).innerHTML = '<tr><td>סה"כ</td>' + cellsOf(null) + '</tr>';
    }
    // "פילוח בשורות": גורם אחראי | סוג הזמנה | action types | סה"כ | SLA; 0 shown as "–" (as the shared table)
    function renderRowsView() {
      var dash = function (n) { return n ? String(n) : '–'; };
      rowsTable.tHead.innerHTML = '<tr><th>גורם אחראי</th><th>סוג הזמנה</th>' + actionsAll.map(function (a) { return '<th>' + h(a) + '</th>'; }).join('') +
        '<th>סה"כ</th>' + slaCols.map(function (c) { return '<th class="' + c.cls + '">' + h(c.label) + '</th>'; }).join('') + '</tr>';
      rowsTable.querySelectorAll('tbody').forEach(function (b) { b.remove(); });
      var keys = rowKeys('resp', 'responsibility', RESP_COLS);
      var html = keys.map(function (k) {
        return '<tbody class="clickable-row' + selCls('resp', k) + '" data-key="' + h(k) + '">' + RETURNS_ORDER_GROUPS.map(function (g, i) {
          var R = function (set) { return Object.assign({ resp: k, otype: g.code }, set); };
          return '<tr>' + (i === 0 ? '<td rowspan="' + RETURNS_ORDER_GROUPS.length + '" class="resp-cell mg-rowlbl"' + sel({ resp: k }) + '>' + h(k) + '</td>' : '') +
            '<td>' + h(g.label) + '</td>' +
            actionsAll.map(function (a) { return cell(R({ action: a }), 'num', dash); }).join('') +
            cell(R({}), 'num grp-total', dash) +
            slaCols.map(function (c) { return cell(R({ sla: slaF(c.key) }), 'num', dash); }).join('') + '</tr>';
        }).join('') + '</tbody>';
      }).join('');
      var foot = rowsTable.tFoot || rowsTable.createTFoot();
      foot.insertAdjacentHTML('beforebegin', html || '<tbody>' + emptyRow(3 + actionsAll.length + slaCols.length) + '</tbody>');
      foot.innerHTML = '<tr><td>סה"כ</td><td></td>' + actionsAll.map(function (a) { return cell({ action: a }, 'num', dash); }).join('') +
        cell({}, 'num', dash) + slaCols.map(function (c) { return cell({ sla: slaF(c.key) }, 'num', dash); }).join('') + '</tr>';
    }
    function renderStatusTable() {
      statusTable.tHead.innerHTML = orig.statusHead;
      if (statusTable.tFoot) statusTable.tFoot.innerHTML = '';
      var keys = rowKeys('status', 'orderStatus', ['prov']);
      $('StatusBody').innerHTML = keys.length ? keys.map(function (k) {
        return '<tr class="clickable-row' + selCls('status', k) + '" data-key="' + h(k) + '"><td class="mg-rowlbl"' + sel({ status: k }) + '>' + h(k) + '</td>' +
          cell({ status: k, prov: 'מחלב' }) + cell({ status: k, prov: 'מוניטין' }) + cell({ status: k }) + '</tr>';
      }).join('') : emptyRow(4);
    }
    // compare mode: rows x (measure x period); every cell is a number of its period, the row label selects the row
    function cmpTable(table, dim, field, rowHead, measures, colDims) {
      var per = ['before', 'from'];
      table.tHead.innerHTML = '<tr><th rowspan="2">' + h(rowHead) + '</th>' + measures.map(function (m) {
        return '<th colspan="2" class="mg-sep ' + (m.th || '') + '">' + h(m.label) + '</th>';
      }).join('') + '</tr><tr>' + measures.map(function () {
        return per.map(function (p, i) { return '<th class="mg-th-' + p + (i === 0 ? ' mg-sep' : '') + '">' + PER_SHORT[p] + '</th>'; }).join('');
      }).join('') + '</tr>';
      var cells = function (k) {
        return measures.map(function (m) {
          return per.map(function (p, i) {
            return cell(Object.assign(withRow(dim, k, m.set), { pick: p }), i === 0 ? 'mg-sep' : '', null, ' data-p="' + p + '"');
          }).join('');
        }).join('');
      };
      var keys = rowKeys(dim, field, colDims);
      table.tBodies[0].innerHTML = keys.length ? keys.map(function (k) {
        var s = {}; s[dim] = k;
        return '<tr class="clickable-row' + selCls(dim, k) + '" data-key="' + h(k) + '"><td class="mg-rowlbl"' + sel(s) + '>' + h(k) + '</td>' + cells(k) + '</tr>';
      }).join('') : emptyRow(1 + 2 * measures.length);
      (table.tFoot || table.createTFoot()).innerHTML = '<tr><td>סה"כ</td>' + cells(null) + '</tr>';
    }
    function renderTables() {
      var viewBtns = document.querySelectorAll('#' + P + 'RespViewToggle .subnav-btn[data-view]');
      var activeView = (document.querySelector('#' + P + 'RespViewToggle .subnav-btn[data-view].active') || {}).dataset;
      var rowsActive = activeView && activeView.view === 'rows';
      if (!cmp()) {
        viewBtns.forEach(function (b) { b.style.display = ''; });
        $('RespMatrixWrap').style.display = rowsActive ? 'none' : '';
        $('RespRowsWrap').style.display = rowsActive ? '' : 'none';
        $('RespCmpWrap').style.display = 'none';
        $('RespCmpTable').tHead.innerHTML = ''; $('RespCmpTable').tBodies[0].innerHTML = '';   // no stale clickable cells
        if ($('RespCmpTable').tFoot) $('RespCmpTable').tFoot.innerHTML = '';
        renderProviderTable();
        renderMatrix();
        renderRowsView();
        renderStatusTable();
      } else {
        viewBtns.forEach(function (b) { b.style.display = 'none'; });
        // the hidden full tables keep the previous render's cells: make them inert (no stale click targets)
        section.querySelectorAll('#' + P + 'RespMatrixWrap [data-ci], #' + P + 'RespRowsWrap [data-ci]').forEach(function (el) {
          el.removeAttribute('data-ci'); el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('aria-pressed');
          el.classList.remove('mg-cell', 'mg-on');
        });
        $('RespMatrixWrap').style.display = 'none';
        $('RespRowsWrap').style.display = 'none';
        $('RespCmpWrap').style.display = '';
        var typeM = [
          { label: 'החזרות 015', set: { otype: '015' } }, { label: 'החלפות 102', set: { otype: '102' } },
          { label: 'סה"כ הזמנות פתוחות', set: {} }];
        var provM = PROVIDERS.map(function (pv) { return { label: pv, set: { prov: pv } }; });
        var slaM = slaCols.map(function (c) { return { label: c.label, th: c.cls, set: { sla: slaF(c.key) } }; });
        cmpTable(provTable, 'prov', 'provider', 'חברת שליחויות', typeM, ['otype']);
        cmpTable($('RespCmpTable'), 'resp', 'responsibility', 'גורם אחראי', typeM.concat(slaM, provM), RESP_COLS);
        cmpTable(statusTable, 'status', 'orderStatus', 'סטטוס הזמנה', provM.concat([{ label: 'סה"כ', set: {} }]), ['prov']);
      }
    }

    // ---- detail, breadcrumb, scope labels, export
    function filterTexts() {
      var parts = [];
      if (st.prov) parts.push('ספק לוגיסטי: ' + st.prov);
      if (cmp()) parts.push(st.pick ? 'תקופה: ' + PER[st.pick] : 'השוואה: שתי התקופות');
      else if (st.period !== 'all') parts.push('תקופה: ' + PER[st.period]);
      BAR_DIMS.forEach(function (d) { if (st[d] !== null) parts.push(d === 'otype' ? OTYPE_LABEL[st.otype] : DIM_LABEL[d] + ': ' + valText(d, st[d])); });
      return parts;
    }
    function renderDetail() {
      var orders = detailOrders();
      var parts = filterTexts();
      $('DetailTitle').textContent = 'פירוט הזמנות - ' + (parts.length ? parts.join(' | ') : 'כל ההזמנות') + ' (' + orders.length + ')';
      $('Breadcrumb').textContent = ['סיכום'].concat(parts).join(' > ');
      var body = $('DetailBody');
      renderReturnsDetail(body, orders);
      Array.prototype.forEach.call(body.rows, function (tr, i) {   // "תקופה" right after "תאריך הזמנה"
        var td = document.createElement('td');
        td.className = 'mg-per-cell mg-per-' + (periodOf(orders[i]) || 'none');
        td.textContent = periodText(orders[i]);
        tr.insertBefore(td, tr.cells[2]);
      });
      var cols = body.closest('table').tHead.rows[0].cells.length;
      if (!orders.length) body.innerHTML = emptyRow(cols);
      else if (cmp() && !st.pick) {   // compare, both periods: a header row before each period's orders
        var nb = inPeriod(orders, 'before').length, nf = orders.length - nb;
        if (nf) body.rows[nb].insertAdjacentHTML('beforebegin',
          '<tr class="mg-per-head mg-per-from"><td colspan="' + cols + '">הזמנות שנפתחו ' + PER.from + ' (' + nf + ')</td></tr>');
        if (nb) body.rows[0].insertAdjacentHTML('beforebegin',
          '<tr class="mg-per-head mg-per-before"><td colspan="' + cols + '">הזמנות שנפתחו ' + PER.before + ' (' + nb + ')</td></tr>');
      }
      $('BackToRespTop').style.display = st.resp !== null ? '' : 'none';
      var others = parts.filter(function (t) { return t.indexOf(DIM_LABEL.resp + ':') !== 0; }).join(' | ');
      setSlaScope(P + 'Stage', st.resp, others);
      setSlaScope(P, st.resp, others);
      $('ExportBtn').disabled = false;
    }
    function exportParts() {
      return {
        provider: st.prov || 'משולב',
        period: cmp() ? (st.pick ? PER_FILE[st.pick] : 'השוואה') : (st.period === 'all' ? null : PER_FILE[st.period]),
        orderType: st.otype || null,
        action: st.action || null,
        responsibility: st.resp || null,
        status: st.status || null,
        stage: null,
        sla: slaLabel(st.sla) || null,
        extraColumns: [{ header: 'תקופה', key: 'period', width: 16, valueOf: periodText }],
      };
    }
    function doExport() { exportReturnsToExcel(detailOrders(), exportParts()); }
    $('ExportBtn').onclick = doExport;
    $('FbExport').onclick = doExport;
    // "הצג את כל ההזמנות": as before -- keeps the provider and period, removes every other filter
    $('ShowAll').onclick = function () {
      ['pick', 'resp', 'status', 'otype', 'action', 'sla'].forEach(function (k) { st[k] = null; });
      render();
    };
    $('BackToRespTop').onclick = function () { st.resp = null; render(); };

    function render() {
      clicks = [];
      renderBar();
      renderNotes();
      renderTop();
      renderStages();
      renderSla();
      renderTables();
      renderDetail();
      syncSticky();
    }
    render();
    // read-only view of the state (tests / debugging); the page never reads it back
    api.view = {
      state: function () { return JSON.parse(JSON.stringify(st)); },
      currentOrders: function () { return detailOrders(); },
      exportParts: exportParts,
    };
  }

  var api = { setup: setup, periodOf: periodOf, periodText: periodText, FROM_KEY: FROM_KEY, view: null };
  return api;
})();
