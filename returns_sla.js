/*
 * SLA control for the Returns/Exchanges tabs (מחלב / מוניטין / סיכום).
 *
 * Built ONLY from the per-order "ימי עבודה בסטטוס" value already computed once
 * on page load (order._statusAge, returns_status_age.js) -- there is no second
 * calculation here. The cards, the day-range cards, the SLA columns of the
 * responsibility breakdown and the detail-table filter all classify through
 * slaOf() / bucketOf() below, so they can never disagree with the table.
 *   Within SLA : days <= 2
 *   Over SLA   : days > 2
 *   לא ידוע    : no number shown (missing / invalid / future status date,
 *                missing or expired business calendar) -- counted separately,
 *                never as 0.
 */
var RETURNS_SLA = (function () {
  var LIMIT = 2;

  var SLA = [
    { key: "within", label: "Within SLA", hint: "עד 2 ימי עבודה", cls: "good" },
    { key: "over", label: "Over SLA", hint: "מעל 2 ימי עבודה", cls: "bad" },
    { key: "unknown", label: "לא ידוע", hint: "ללא ימי עבודה בסטטוס", cls: "unknown" },
  ];

  // Same five ranges (and colours) as the פילוח cards of the תאום tab.
  var BUCKETS = [
    { key: "d0_1", label: "עד יום עבודה אחד", cls: "" },
    { key: "d2", label: "2 ימי עבודה", cls: "" },
    { key: "d3", label: "3 ימי עבודה", cls: "mid" },
    { key: "d4_5", label: "4–5 ימי עבודה", cls: "late" },
    { key: "d6p", label: "יותר מ־5 ימי עבודה", cls: "late" },
  ];

  // The number shown in the "ימי עבודה בסטטוס" column, or null when none is shown.
  function daysOf(o) {
    var a = o && o._statusAge;
    return a && a.state === "ok" && typeof a.days === "number" && isFinite(a.days) ? a.days : null;
  }

  function slaOf(o) {
    var d = daysOf(o);
    return d === null ? "unknown" : (d <= LIMIT ? "within" : "over");
  }

  function bucketOf(o) {
    var d = daysOf(o);
    if (d === null) return null;
    if (d <= 1) return "d0_1";
    if (d === 2) return "d2";
    if (d === 3) return "d3";
    if (d <= 5) return "d4_5";
    return "d6p";
  }

  // filter: null | {kind: "sla" | "bucket", key}
  function matches(o, filter) {
    if (!filter) return true;
    return filter.kind === "sla" ? slaOf(o) === filter.key : bucketOf(o) === filter.key;
  }

  function sameFilter(a, b) {
    return !!a && !!b && a.kind === b.kind && a.key === b.key;
  }

  function labelOf(filter) {
    if (!filter) return "";
    var list = filter.kind === "sla" ? SLA : BUCKETS;
    for (var i = 0; i < list.length; i++) if (list[i].key === filter.key) return list[i].label;
    return "";
  }

  function summarize(orders) {
    var s = { total: 0, sla: { within: 0, over: 0, unknown: 0 }, buckets: {} };
    BUCKETS.forEach(function (b) { s.buckets[b.key] = 0; });
    (orders || []).forEach(function (o) {
      s.total++;
      s.sla[slaOf(o)]++;
      var b = bucketOf(o);
      if (b) s.buckets[b]++;
    });
    return s;
  }

  function esc(v) {
    return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function card(cls, value, label, attrs, active) {
    return '<div class="card sla-pick' + (cls ? " " + cls : "") + (active ? " sla-active" : "") +
      '" role="button" tabindex="0" aria-pressed="' + (active ? "true" : "false") + '" ' + attrs + '>' +
      '<div class="v">' + value + '</div><div class="k">' + esc(label) + "</div></div>";
  }

  function wire(container, onPick) {
    Array.prototype.forEach.call(container.querySelectorAll(".sla-pick"), function (el) {
      var f = el.dataset.kind ? { kind: el.dataset.kind, key: el.dataset.key } : null;
      el.onclick = function () { onPick(f); };
      el.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(f); }
      };
    });
  }

  // Renders the SLA cards and the day-range cards for `orders` (the orders in
  // the current non-SLA selection). orders === null -> no data ("–", not clickable).
  // onPick(filter) receives the clicked card's filter (null = the total card).
  function render(cardsEl, agingEl, orders, filter, onPick) {
    if (!cardsEl || !agingEl) return;
    if (orders === null) {
      cardsEl.innerHTML = SLA.slice(0, 2).reduce(function (h, x) {
        return h + '<div class="card ' + x.cls + '"><div class="v">–</div><div class="k">' + esc(x.label) + "</div></div>";
      }, '<div class="card"><div class="v">–</div><div class="k">סה"כ הזמנות פתוחות</div></div>');
      agingEl.innerHTML = BUCKETS.map(function (b) {
        return '<div class="card ' + b.cls + '"><div class="v">–</div><div class="k">' + esc(b.label) + "</div></div>";
      }).join("");
      return;
    }
    var s = summarize(orders);
    var html = card("", s.total, 'סה"כ הזמנות פתוחות', "", false);
    SLA.forEach(function (x) {
      if (x.key === "unknown" && !s.sla.unknown) return; // shown only when such orders exist
      html += card(x.cls, s.sla[x.key], x.label + " (" + x.hint + ")",
        'data-kind="sla" data-key="' + x.key + '"', sameFilter(filter, { kind: "sla", key: x.key }));
    });
    cardsEl.innerHTML = html;
    agingEl.innerHTML = BUCKETS.map(function (b) {
      return card(b.cls, s.buckets[b.key], b.label,
        'data-kind="bucket" data-key="' + b.key + '"', sameFilter(filter, { kind: "bucket", key: b.key }));
    }).join("");
    wire(cardsEl, onPick);
    wire(agingEl, onPick);
  }

  // Click on the active card again -> clear; total card -> clear; else select.
  function toggle(current, picked) {
    return !picked || sameFilter(current, picked) ? null : picked;
  }

  return {
    LIMIT: LIMIT,
    SLA: SLA,
    BUCKETS: BUCKETS,
    daysOf: daysOf,
    slaOf: slaOf,
    bucketOf: bucketOf,
    matches: matches,
    sameFilter: sameFilter,
    labelOf: labelOf,
    summarize: summarize,
    render: render,
    toggle: toggle,
  };
})();
