/*
 * Tracked-status cards for the two Returns/Exchanges summary tabs
 * (סיכום החזרות והחלפות, החזרות והחלפות — מ-01/10/2026).
 *
 * Each card = the orders whose orderStatus is EXACTLY the Priority value below
 * (the display label is the wording requested by the business). SLA figures
 * come only from the existing classifier (RETURNS_SLA.slaOf -> the per-order
 * "ימי עבודה בסטטוס" value, o._statusAge) -- no second calculation:
 *   חריגות          = Over SLA (more than 2 working days in the current status)
 *   עמידה ב-SLA (%) = Within / (Within + Over); "לא ידוע" is excluded and shown
 *                     separately when present; no classified orders -> "—".
 * The cards are counted over the orders passed in (the tab's current
 * provider / responsibility / status selection), so a card's number is the
 * number of detail rows its click shows (when no SLA card is selected).
 */
var RETURNS_STAGES = (function () {
  var STAGES = [
    { key: "pickup", status: "המתנה לאיסוף", label: "בהמתנה לאיסוף" },
    { key: "transit", status: "בדרך למחסן", label: "בדרך למחסן" },
    { key: "kamash", status: "בטיפול קמש", label: "בטיפול קמ\"ש" },
  ];

  function stageOf(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return STAGES[i];
    return null;
  }

  function matches(o, key) {
    if (!key) return true;
    var s = stageOf(key);
    return !!s && !!o && o.orderStatus === s.status;
  }

  function labelOf(key) {
    var s = stageOf(key);
    return s ? s.label : "";
  }

  function slaOf(o) {
    return typeof RETURNS_SLA !== "undefined" ? RETURNS_SLA.slaOf(o) : "unknown";
  }

  // Compliance %, or null when no order in the card has a known SLA value.
  function pctOf(r) {
    var known = r.within + r.over;
    return known ? (100 * r.within) / known : null;
  }

  function fmtPct(p) {
    if (p === null) return "—";
    var r = Math.round(p * 10) / 10;
    return (r % 1 === 0 ? String(r) : r.toFixed(1)) + "%";
  }

  function summarize(orders) {
    var out = {};
    STAGES.forEach(function (s) { out[s.key] = { n: 0, within: 0, over: 0, unknown: 0 }; });
    (orders || []).forEach(function (o) {
      STAGES.forEach(function (s) {
        if (o.orderStatus !== s.status) return;
        var r = out[s.key];
        r.n++;
        r[slaOf(o)]++;
      });
    });
    STAGES.forEach(function (s) { out[s.key].pct = pctOf(out[s.key]); });
    return out;
  }

  function esc(v) {
    return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // orders === null -> no data ("–", not clickable).
  function render(el, orders, activeKey, onPick) {
    if (!el) return;
    if (orders === null) {
      el.innerHTML = STAGES.map(function (s) {
        return '<div class="card stage-card"><div class="v">–</div><div class="k">' + esc(s.label) + "</div></div>";
      }).join("");
      return;
    }
    var sum = summarize(orders);
    el.innerHTML = STAGES.map(function (s) {
      var r = sum[s.key], active = activeKey === s.key;
      return '<div class="card stage-card stage-pick' + (active ? " sla-active" : "") +
        '" role="button" tabindex="0" aria-pressed="' + (active ? "true" : "false") + '" data-stage="' + s.key + '">' +
        '<div class="v">' + r.n + '</div><div class="k">' + esc(s.label) + "</div>" +
        // <bdi> keeps the mixed Hebrew/"SLA" label in order before the value (RTL page).
        '<div class="stage-sub"><span><bdi>חריגות מה-SLA</bdi>: <b class="stage-over">' + r.over + "</b></span>" +
        '<span><bdi>עמידה ב-SLA</bdi>: <b class="stage-pct">' + fmtPct(r.pct) + "</b></span>" +
        (r.unknown ? '<span><bdi>לא ידוע</bdi>: <b class="stage-unknown">' + r.unknown + "</b></span>" : "") +
        "</div></div>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".stage-pick"), function (c) {
      var key = c.dataset.stage;
      c.onclick = function () { onPick(key); };
      c.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(key); }
      };
    });
  }

  // Four clickable metrics per card: total / within SLA / over SLA / compliance %, plus "לא ידוע"
  // when such orders exist. onPick(key, slaKey): slaKey null (total, %) | "within" | "over" | "unknown".
  // The caller filters by stage + that SLA value, so the detail list is exactly the clicked number.
  // activeSla: the SLA key of the caller's active SLA filter (null = none, any other string = a filter
  // that is not one of these numbers, e.g. a working-days bucket).
  function renderDetailed(el, orders, activeKey, activeSla, onPick) {
    if (!el) return;
    if (orders === null) { render(el, null); return; }
    var sum = summarize(orders);
    el.innerHTML = STAGES.map(function (s) {
      var r = sum[s.key];
      var num = function (slaKey, inner) {
        var on = activeKey === s.key && (activeSla || null) === (slaKey || null);
        return '<span class="stage-num' + (on ? " stage-num-on" : "") + '" role="button" tabindex="0" aria-pressed="' + on +
          '" data-stage-key="' + s.key + '" data-sla="' + (slaKey || "") + '">' + inner + "</span>";
      };
      return '<div class="card stage-card stage-detailed' + (activeKey === s.key ? " sla-active" : "") + '" data-stage="' + s.key + '">' +
        '<div class="v">' + num(null, '<span class="stage-n">' + r.n + "</span>") + '</div><div class="k">' + esc(s.label) + "</div>" +
        '<div class="stage-sub">' +
        num("within", "<bdi>עומדות ב-SLA</bdi>: <b class=\"stage-within\">" + r.within + "</b>") +
        num("over", "<bdi>חורגות מ-SLA</bdi>: <b class=\"stage-over\">" + r.over + "</b>") +
        num(null, "<bdi>עמידה ב-SLA</bdi>: <b class=\"stage-pct\">" + fmtPct(r.pct) + "</b>") +
        (r.unknown ? num("unknown", "<bdi>לא ידוע</bdi>: <b class=\"stage-unknown\">" + r.unknown + "</b>") : "") +
        "</div></div>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".stage-num"), function (n) {
      var go = function () { onPick(n.dataset.stageKey, n.dataset.sla || null); };
      n.onclick = function (e) { e.stopPropagation(); go(); };
      n.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      };
    });
  }

  // Click on the active card again -> clear; else select.
  function toggle(current, picked) {
    return !picked || current === picked ? null : picked;
  }

  return {
    STAGES: STAGES,
    matches: matches,
    labelOf: labelOf,
    summarize: summarize,
    fmtPct: fmtPct,
    render: render,
    renderDetailed: renderDetailed,
    toggle: toggle,
  };
})();
