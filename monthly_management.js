/* "תמונה ניהולית חודשית" — display only (approved 2026-11-11).
 * Reads data.monthlyManagementSummary (schemaVersion 1) from dashboard_data.json; computes nothing
 * except the column totals of the daily table, which must equal the current-month figures.
 * The block is shown only if status === 'PASSED', schemaVersion is supported, its dataAsOf equals
 * metadata.dataAsOf and every figure is a non-negative integer; otherwise "not available".
 */
var MONTHLY_MGMT = (function () {
  'use strict';
  var SCHEMA = 1;
  var METRICS = [
    ['ordersReceived', 'סה"כ הזמנות שהתקבלו'],
    ['waitingForCoordination', 'שויכו למסלול ממתין לתאום (מסלול אחרון)'],
    ['approvedForIssue', 'שויכו למסלול מאושרת לניפוק (מסלול אחרון)'],
    ['pickup', 'שויכו למסלול יגיעו לאסוף (מסלול אחרון)'],
    ['coordinatedMonitin', 'תואם מוניטין – תיאומים שהושלמו (כניסה אחרונה)']
  ];
  var DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

  function el(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isCount(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0; }
  function mmyyyy(dmy) { var m = DMY.exec(dmy); return m ? m[2] + '/' + m[3] : ''; }
  function ddmm(dmy) { var m = DMY.exec(dmy); return m ? m[1] + '/' + m[2] : ''; }

  function periodOk(p) {
    return !!p && DMY.test(p.month) && DMY.test(p.from) && DMY.test(p.to) &&
      METRICS.every(function (m) { return isCount(p[m[0]]); });
  }

  /** 'ok' | 'missing' | 'schema' | 'failed' | 'mismatch' | 'invalid' */
  function blockStatus(data) {
    var b = data && data.monthlyManagementSummary;
    var meta = (data && data.metadata) || {};
    if (!b) return 'missing';
    if (b.schemaVersion !== SCHEMA) return 'schema';
    if (b.status !== 'PASSED') return 'failed';
    if (!b.dataAsOf || b.dataAsOf !== meta.dataAsOf) return 'mismatch';
    if (!periodOk(b.previousMonth) || !periodOk(b.currentMonth) || !Array.isArray(b.currentMonthDaily) ||
        !b.currentMonthDaily.length) return 'invalid';
    var rowsOk = b.currentMonthDaily.every(function (r) {
      return r && DMY.test(r.date) && METRICS.every(function (m) { return isCount(r[m[0]]); });
    });
    return rowsOk ? 'ok' : 'invalid';
  }

  function unavailable() {
    if (el('mmContent')) el('mmContent').hidden = true;
    if (el('mmUnavailable')) el('mmUnavailable').hidden = false;
  }

  function dailyTotals(rows) {
    var t = {};
    METRICS.forEach(function (m) { t[m[0]] = 0; });
    rows.forEach(function (r) { METRICS.forEach(function (m) { t[m[0]] += r[m[0]]; }); });
    return t;
  }

  function render(data) {
    var st = blockStatus(data);
    if (st !== 'ok') { unavailable(); return st; }
    var b = data.monthlyManagementSummary, prev = b.previousMonth, cur = b.currentMonth;
    var partial = '<span class="mm-partial">חלקי — עד ' + esc(ddmm(cur.to)) + '</span>';

    el('mmHead').innerHTML = '<tr><th>מדד</th><th>חודש קודם — ' + esc(mmyyyy(prev.month)) +
      '</th><th>חודש נוכחי — ' + esc(mmyyyy(cur.month)) + ' ' + partial + '</th></tr>';
    el('mmRows').innerHTML = METRICS.map(function (m) {
      return '<tr data-metric="' + m[0] + '"><td class="mm-label">' + esc(m[1]) + '</td><td class="num">' +
        esc(prev[m[0]]) + '</td><td class="num">' + esc(cur[m[0]]) + '</td></tr>';
    }).join('');
    el('mmAsOf').textContent = 'נכון ל־' + b.dataAsOf + '.';

    var rows = b.currentMonthDaily;
    el('mmDailyTitle').innerHTML = 'פירוט יומי — ' + esc(mmyyyy(cur.month)) + ' ' + partial +
      ' <span class="note">(לחצו לפתיחה/סגירה)</span>';
    el('mmDailyRows').innerHTML = rows.map(function (r) {
      return '<tr><td>' + esc(ddmm(r.date)) + '</td>' + METRICS.map(function (m) {
        return '<td class="num">' + esc(r[m[0]]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var t = dailyTotals(rows);
    el('mmDailyFoot').innerHTML = '<tr><td>סה"כ חודש</td>' + METRICS.map(function (m) {
      return '<td class="num">' + esc(t[m[0]]) + '</td>';
    }).join('') + '</tr>';
    var bad = METRICS.filter(function (m) { return t[m[0]] !== cur[m[0]]; });
    var warn = el('mmDailyWarn');
    warn.hidden = bad.length === 0;
    warn.textContent = bad.length ? 'אי-התאמה בין הפירוט היומי לסיכום החודשי במדדים: ' +
      bad.map(function (m) { return m[1]; }).join(', ') + '. יש לבדוק את הנתונים.' : '';

    el('mmUnavailable').hidden = true;
    el('mmContent').hidden = false;
    return bad.length ? 'sum-mismatch' : 'ok';
  }

  return { render: render, unavailable: unavailable, blockStatus: blockStatus, dailyTotals: dailyTotals,
           METRICS: METRICS };
})();
