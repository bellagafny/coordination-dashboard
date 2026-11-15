/*
 * גיל מלאי מוצרים מושמשים -- block rendered directly under the
 * "התפתחות מלאי מוצרים מושמשים" table (inside <section id="inventory">).
 *
 * Container: <div id="inventory-aging" data-src="..."><div id="ageRoot"></div></div>
 *   - published site: data-src="inventory_aging_summary.json" (public management
 *     summary: locations + total only -- built by app/inventory_aging.py --public-output)
 *   - local view:     data-src="inventory_aging.json" (full file; adds the
 *     collapsed internal-control block: company x location, SKU match, mapping)
 *   - standalone presentation file: window.INVENTORY_AGING_DATA.
 *
 * Every number comes as-is from the JSON; this file only renders.
 * Fully decoupled from inventory.js and the other sections: own data, own error
 * banner, own DOM (inside #ageRoot) and own CSS (prefix "age-"). The existing
 * inventory table and its calculations are not touched.
 */
(function () {
  'use strict';

  var NUM = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
  var COLORS = ['#70ad47', '#a9d18e', '#ffd966', '#f4b183', '#c00000'];

  var CSS = [
    '#inventory-aging{margin-top:26px}',
    '#inventory-aging .age-title{margin:0 -14px 12px;padding:9px 14px;background:#eef3fb;border-top:2px solid var(--navy);border-bottom:none;color:var(--navy);font-size:18px}',
    '#inventory-aging .age-h{font-size:14px;color:var(--navy);border-bottom:1px solid var(--line);padding-bottom:4px;margin:18px 0 8px}',
    '#inventory-aging td.num,#inventory-aging th{text-align:center}#inventory-aging td.num{direction:ltr}',
    '#inventory-aging td:first-child{text-align:right}',
    '#inventory-aging tr.age-total td,#inventory-aging td.age-total{font-weight:bold;background:#dfe7f3}',
    '#inventory-aging tr.age-total td{border-top:2px solid var(--navy)}',
    '.age-meta{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12.5px;color:#344054;margin:0 0 10px}',
    '.age-meta b{color:var(--navy)}',
    '.age-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}',
    '.age-card{border:1px solid var(--line);border-top:5px solid var(--blue);border-radius:6px;padding:12px 14px;background:#fff}',
    '.age-card.total{border-top-color:var(--navy);background:#f6f8fb}',
    '.age-card h4{margin:0 0 6px;font-size:15px;color:var(--navy)}',
    '.age-card .avg{font-size:32px;font-weight:800;color:var(--navy);line-height:1.1}',
    '.age-card .avg small{font-size:14px;font-weight:bold;color:#475467}',
    '.age-card .sub{font-size:12px;color:#667085;margin-bottom:8px}',
    '.age-card .kv{display:flex;justify-content:space-between;gap:6px;font-size:13px;padding:5px 0;border-top:1px solid #eef1f5}',
    '.age-card .kv b{direction:ltr;white-space:nowrap}.age-card .kv .o180{color:var(--orange)}.age-card .kv .o365{color:var(--red)}',
    '.age-bars{display:grid;gap:9px;margin:6px 0 4px}',
    '.age-bar-row{display:grid;grid-template-columns:100px 1fr 84px;gap:8px;align-items:center;font-size:13px}',
    '.age-bar-row .lbl{font-weight:bold;color:var(--navy)}.age-bar-row .tot{direction:ltr;text-align:left;color:#667085}',
    '.age-bar{display:flex;height:28px;border-radius:4px;overflow:hidden;background:#eef1f5}',
    '.age-bar span{display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:bold;color:#1f2937;white-space:nowrap;overflow:hidden}',
    '.age-bar span.dark{color:#fff}',
    '.age-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;margin:4px 0 10px}',
    '.age-legend i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-inline-end:4px;vertical-align:-2px}',
    '.age-diff-0{color:#2e7d32;font-weight:bold}.age-diff{color:var(--orange);font-weight:bold}',
    '.age-pct{color:#667085;font-size:11.5px}',
    '#inventory-aging table.age-cmp{min-width:600px}',
    '#inventory-aging table.age-cmp td:first-child{font-weight:bold;color:var(--navy);background:#f6f8fb;white-space:normal;min-width:120px}',
    '#inventory-aging table.age-cmp tr.grp td{border-top:2px solid var(--navy)}',
    '#inventory-aging details.age-control{margin-top:16px;border:1px solid var(--line);border-radius:6px;padding:8px 12px}',
    '#inventory-aging details.age-control summary{cursor:pointer;font-weight:bold;color:var(--navy)}',
    '#inventory-aging .age-st-approved{color:#2e7d32;font-weight:bold}#inventory-aging .age-st-working{color:#7f6000}',
    '#inventory-aging ul.note{padding-inline-start:18px;margin:4px 0}',
    '@media(max-width:900px){.age-cards{grid-template-columns:repeat(2,1fr)}}',
    '@media(max-width:650px){#inventory-aging .age-title{margin:0 -10px 10px;padding:8px 10px;font-size:16px}' +
      '.age-bar-row{grid-template-columns:64px 1fr 62px;font-size:12px}.age-card{padding:10px}.age-card .avg{font-size:26px}' +
      '.age-card .kv{font-size:12px}}',
    '@media(max-width:420px){.age-cards{grid-template-columns:1fr}}'
  ].join('\n');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(v) { return v == null ? '—' : NUM.format(v); }
  function pct(v) { return v == null ? '—' : NUM.format(v) + '%'; }
  function diffCell(v) {
    if (v == null) return '<td class="num">—</td>';
    var ok = Math.abs(v) < 1e-9;
    return '<td class="num ' + (ok ? 'age-diff-0' : 'age-diff') + '">' + (ok ? '0 ✓' : (v > 0 ? '+' : '') + NUM.format(v)) + '</td>';
  }
  function h4(t) { return '<h4 class="age-h">' + t + '</h4>'; }

  function groups(d) {
    return d.locations.concat([Object.assign({ name: 'סה"כ', key: '_total' }, d.total)]);
  }

  function cards(d) {
    return '<div class="age-cards">' + groups(d).map(function (g) {
      return '<div class="age-card' + (g.key === '_total' ? ' total' : '') + '"><h4>' + esc(g.key === '_total' ? 'סה"כ 3 המיקומים' : g.name) + '</h4>' +
        '<div class="avg">' + n(g.weightedAvgDays) + ' <small>ימים</small></div>' +
        '<div class="sub">גיל ממוצע משוקלל · ' + n(g.positiveUnits) + ' יח\' במלאי</div>' +
        '<div class="kv"><span>מעל 180 ימים</span><b class="o180">' + n(g.over180Units) + ' (' + pct(g.over180Pct) + ')</b></div>' +
        '<div class="kv"><span>מעל 365 ימים</span><b class="o365">' + n(g.over365Units) + ' (' + pct(g.over365Pct) + ')</b></div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function bars(d) {
    var bk = d.metadata.buckets;
    var html = '<div class="age-legend">' + bk.map(function (b, i) {
      return '<span><i style="background:' + COLORS[i] + '"></i>' + esc(b.label) + ' ימים</span>';
    }).join('') + '</div><div class="age-bars">';
    groups(d).forEach(function (g) {
      html += '<div class="age-bar-row"><span class="lbl">' + esc(g.name) + '</span><div class="age-bar" role="img" aria-label="התפלגות גיל — ' + esc(g.name) + '">';
      bk.forEach(function (b, i) {
        var v = g.buckets[b.key] || 0, p = g.bucketPct[b.key] || 0;
        if (v <= 0) return;
        html += '<span class="' + (i === 4 ? 'dark' : '') + '" style="width:' + p + '%;background:' + COLORS[i] + '" title="' +
          esc(b.label) + ' ימים: ' + NUM.format(v) + ' יח\' (' + NUM.format(p) + '%)">' + (p >= 7 ? Math.round(p) + '%' : '') + '</span>';
      });
      html += '</div><span class="tot">' + n(g.positiveUnits) + ' יח\'</span></div>';
    });
    return html + '</div>';
  }

  function compare(d) {
    var gs = groups(d), bk = d.metadata.buckets;
    function row(label, f, cls) {
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td>' + gs.map(function (g) {
        return '<td class="num' + (g.key === '_total' ? ' age-total' : '') + '">' + f(g) + '</td>';
      }).join('') + '</tr>';
    }
    function qp(v, p) { return n(v) + ' <span class="age-pct">(' + pct(p) + ')</span>'; }
    var h = '<div class="table-wrap"><table class="age-cmp"><thead><tr><th>מדד</th>' +
      gs.map(function (g) { return '<th>' + esc(g.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += row('גיל ממוצע משוקלל (ימים)', function (g) { return '<b>' + n(g.weightedAvgDays) + '</b>'; });
    h += row('יתרת מלאי נטו', function (g) { return n(g.netUnits); }, 'grp');
    h += row('יחידות ביתרה חיובית', function (g) { return n(g.positiveUnits); });
    h += row('יתרות שליליות (מחוץ לחישוב הגיל)', function (g) {
      return g.negativeUnits && g.negativeRecords != null ? n(g.negativeUnits) + ' <span class="age-pct">(' + g.negativeRecords + ' רשומות)</span>' : n(g.negativeUnits);
    });
    bk.forEach(function (b, i) {
      h += row(esc(b.label) + ' ימים', function (g) { return qp(g.buckets[b.key], g.bucketPct[b.key]); }, i === 0 ? 'grp' : '');
    });
    h += row('מתוכם מעל 365 ימים', function (g) { return qp(g.over365Units, g.over365Pct); }, 'grp');
    return h + '</tbody></table></div><p class="note">אחוזים מתוך היחידות ביתרה חיובית. "מעל 365" הוא חלק מ"מעל 180".</p>';
  }

  function reconciliation(d) {
    var m = d.metadata, sku = null;
    if (d.control) { sku = {}; d.control.bySku.forEach(function (s) { sku[s.location] = s; }); }
    var h = '<div class="table-wrap"><table style="min-width:560px"><thead><tr><th>מיקום</th><th>יתרת סגירה בדשבורד</th><th>תאריך נתוני הדשבורד</th>' +
      '<th>יתרה נטו בנתוני הגיל</th><th>הפרש (גיל − דשבורד)</th>' + (sku ? '<th>מק"טים תואמים</th>' : '') + '</tr></thead><tbody>';
    d.locations.forEach(function (l) {
      var s = sku && sku[l.key];
      h += '<tr><td>' + esc(l.name) + '</td><td class="num">' + n(l.dashboardClosing) + '</td><td class="num">' + esc(l.dashboardDate || '') + '</td>' +
        '<td class="num">' + n(l.netUnits) + '</td>' + diffCell(l.difference) +
        (sku ? '<td class="num">' + (s ? n(s.skusMatching) + ' / ' + n(s.skusCompared) : '—') + '</td>' : '') + '</tr>';
    });
    var skuTot = '';
    if (sku) {
      var tm = 0, tc = 0;
      d.control.bySku.forEach(function (s) { tm += s.skusMatching; tc += s.skusCompared; });
      skuTot = '<td class="num">' + n(tm) + ' / ' + n(tc) + '</td>';
    }
    h += '<tr class="age-total"><td>סה"כ</td><td class="num">' + n(d.total.dashboardClosing) + '</td><td></td><td class="num">' + n(d.total.netUnits) +
      '</td>' + diffCell(d.total.difference) + skuTot + '</tr></tbody></table></div>';
    h += '<p class="note">נתוני גיל המלאי נכונים ל-' + esc(m.ageDataDate) + '. כשתאריכי שני המקורות שונים, הפרשים קטנים צפויים; הפרשים מוצגים כפי שהם ואינם מאוזנים.</p>';
    if (sku) {
      var gaps = [];
      d.control.bySku.forEach(function (s) {
        s.differences.forEach(function (x) {
          gaps.push('<tr><td>' + esc(s.locationName) + '</td><td>' + esc(x.sku) + '</td><td class="num">' + n(x.dashboardClosing) +
            '</td><td class="num">' + n(x.ageNetUnits) + '</td>' + diffCell(x.difference) + '</tr>');
        });
      });
      if (gaps.length) {
        h += h4('פערים ברמת מק"ט') + '<div class="table-wrap"><table style="min-width:480px"><thead><tr><th>מיקום</th><th>מק"ט</th><th>דשבורד</th><th>נתוני הגיל</th><th>הפרש</th></tr></thead><tbody>' +
          gaps.join('') + '</tbody></table></div>';
      }
    }
    return h;
  }

  // Local view only (full JSON): never present in the public summary.
  function control(d) {
    var c = d.control;
    var h = '<details class="age-control"><summary>בקרה פנימית (תצוגה מקומית בלבד) — חברה × מיקום ומיפוי המחסנים</summary>';
    h += h4('התאמה לפי חברה ומיקום') + '<div class="table-wrap"><table style="min-width:560px"><thead><tr><th>מיקום</th><th>חברה</th><th>יתרת סגירה בדשבורד</th><th>יתרה נטו בנתוני הגיל</th><th>הפרש</th></tr></thead><tbody>' +
      c.byCompanyLocation.map(function (r) {
        return '<tr><td>' + esc(r.locationName) + '</td><td>' + esc(r.companyName || '') + ' <span class="age-pct">(' + esc(r.company) + ')</span></td>' +
          '<td class="num">' + n(r.dashboardClosing) + '</td><td class="num">' + n(r.ageNetUnits) + '</td>' + diffCell(r.difference) + '</tr>';
      }).join('') + '</tbody></table></div>';
    var locName = {};
    d.locations.forEach(function (l) { locName[l.key] = l.name; });
    h += h4('מיפוי מחסנים (קוד חברה + מספר מחסן ← מיקום)') + '<div class="table-wrap"><table style="min-width:640px"><thead><tr><th>מיקום</th><th>חברה</th><th>מחסן</th>' +
      '<th>שם המחסן בפריוריטי (אינו מעיד על המיקום הפיזי)</th><th>יתרה נטו</th><th>סטטוס השיוך</th></tr></thead><tbody>' +
      c.mapping.map(function (e) {
        return '<tr><td>' + esc(locName[e.location]) + '</td><td>' + esc(e.company) + '</td><td class="num">' + esc(e.warehouse) + '</td><td>' +
          esc(e.description || 'לא נמצא בקובץ') + '</td><td class="num">' + n(e.netUnits) + '</td><td class="age-st-' + esc(e.status) + '">' +
          esc(e.statusLabel) + (e.note ? ' — ' + esc(e.note) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var dc = c.doubleCount;
    h += '<p class="note">מניעת ספירה כפולה: ' + n(dc.recordsInFile) + ' רשומות בקובץ = ' + n(dc.recordsAssigned) + ' משויכות + ' + n(dc.recordsUnmapped) +
      ' שאינן במחסנים הממופים; רשומות שנספרו יותר מפעם אחת: ' + n(dc.recordsAssignedMoreThanOnce) + '.</p>';
    h += '<p class="note">רשומות במחסנים שאינם ממופים (לא נכללו): ' + c.unmappedByCompany.map(function (u) {
      return esc(u.companyName || u.company) + ' — ' + n(u.records) + ' רשומות, ' + n(u.netUnits) + ' יח\' נטו';
    }).join('; ') + '.</p>';
    return h + '</details>';
  }

  function render(root, d) {
    var m = d.metadata;
    var html =
      '<div class="age-meta"><span>נתוני גיל המלאי נכונים ל: <b>' + esc(m.ageDataDate) + '</b></span>' +
      '<span>עודכן: ' + esc(m.generatedAt) + '</span>' +
      (m.sourceFile ? '<span>קובץ מקור: ' + esc(m.sourceFile) + '</span>' : '') + '</div>' +
      h4('גיל מלאי ומלאי ותיק לפי מיקום') + cards(d) +
      h4('התפלגות יחידות לפי קבוצות גיל') + bars(d) +
      h4('השוואה בין המיקומים') + compare(d) +
      h4('התאמת יתרות מול טבלת התפתחות המלאי (נטו)') + reconciliation(d) +
      (d.control ? control(d) : '') +
      '<ul class="note"><li>' + esc(m.method) + '</li>' +
      '<li>שלוש החברות מאוחדות בכל מיקום, לפי טבלת מיפוי תפעולית של המחסנים.</li></ul>';
    root.innerHTML = html;
  }

  function fail(root, src, msg) {
    root.innerHTML = '<div class="status-banner status-bad">לא ניתן היה לטעון את נתוני גיל המלאי (' + esc(src) + '): ' + esc(msg) +
      '. שאר חלקי הדשבורד אינם מושפעים.</div>';
  }

  function init() {
    var root = document.getElementById('ageRoot'), box = document.getElementById('inventory-aging');
    if (!root || !box) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var src = box.getAttribute('data-src') || 'inventory_aging_summary.json';
    if (window.INVENTORY_AGING_DATA) {
      try { render(root, window.INVENTORY_AGING_DATA); } catch (e) { fail(root, 'embedded', e.message); }
      return;
    }
    fetch(src, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { render(root, d); })
      .catch(function (err) { fail(root, src, err.message); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
