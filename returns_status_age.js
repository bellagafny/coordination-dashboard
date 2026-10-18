/*
 * "ימי עבודה בסטטוס" for the Returns/Exchanges tabs, computed in the browser on
 * every page load (so the count advances without a new Excel file).
 *
 * businessDaysBetween() is a line-for-line port of
 * app/business_calendar.py:business_days_between -- same rules, do not change
 * one without the other (parity-tested against Python):
 *   - business days strictly AFTER the start's calendar date, through the end's
 *     calendar date (inclusive); same calendar day => 0; end before start => 0
 *   - time of day is ignored for the count
 *   - Friday and Saturday are never business days (Python weekday {4, 5})
 *   - every date in metadata.businessCalendar.nonBusinessDates is not a business
 *     day (built by Python from business_calendar.json -- the single source)
 * "Now" is the current wall-clock time in Asia/Jerusalem, never the viewer's
 * own time zone. statusUpdate values are Israel wall-clock times as exported.
 *
 * No number is ever shown when it could be wrong: missing / invalid / future
 * status dates, a missing or malformed calendar, or a calculation date after
 * the calendar's validThrough all give "—" (never 0).
 */
var RETURNS_STATUS_AGE = (function () {
  var TIME_ZONE = "Asia/Jerusalem";
  var WEEKEND_UTC_DAYS = [5, 6]; // JS getUTCDay(): Sunday=0 ... Friday=5, Saturday=6
  var MS_PER_DAY = 86400000;

  var TEXT = {
    none: "—",
    invalidDate: "תאריך לא תקין",
    future: "— (תאריך עתידי)",
    noCalendar: "— (אין לוח ימי עבודה)",
    calendarExpired: "— (לוח ימי עבודה לא בתוקף)",
  };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function validParts(p) {
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d, p.H || 0, p.M || 0, p.S || 0));
    return t.getUTCFullYear() === p.y && t.getUTCMonth() === p.m - 1 && t.getUTCDate() === p.d &&
      t.getUTCHours() === (p.H || 0) && t.getUTCMinutes() === (p.M || 0) && t.getUTCSeconds() === (p.S || 0);
  }

  // "YYYY-MM-DD" -> {y, m, d} or null (rejects 2026-02-30 etc.)
  function parseIsoDate(s) {
    var m = typeof s === "string" && s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var p = { y: +m[1], m: +m[2], d: +m[3], H: 0, M: 0, S: 0 };
    return validParts(p) ? p : null;
  }

  // "YYYY-MM-DDTHH:MM:SS" (returns_config.STATUS_UPDATE_JSON_FMT) -> parts or null
  function parseIsoDateTime(s) {
    var m = typeof s === "string" && s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    var p = { y: +m[1], m: +m[2], d: +m[3], H: +m[4], M: +m[5], S: +m[6] };
    return validParts(p) ? p : null;
  }

  function dayNumber(p) { return Math.round(Date.UTC(p.y, p.m - 1, p.d) / MS_PER_DAY); }

  function compareParts(a, b) {
    var keys = ["y", "m", "d", "H", "M", "S"];
    for (var i = 0; i < keys.length; i++) {
      var x = a[keys[i]] || 0, y = b[keys[i]] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  // Validates metadata.businessCalendar -> {ok, reason, holidays:{dayNumber:true}, validThroughDay, validThrough}
  function prepareCalendar(cal) {
    if (!cal || typeof cal !== "object") return { ok: false, reason: "missing" };
    var list = cal.nonBusinessDates;
    if (!Array.isArray(list) || list.length === 0) return { ok: false, reason: "no dates" };
    var holidays = {}, prev = null;
    for (var i = 0; i < list.length; i++) {
      var p = parseIsoDate(list[i]);
      if (!p) return { ok: false, reason: "invalid date " + list[i] };
      var dn = dayNumber(p);
      if (prev !== null && dn <= prev) return { ok: false, reason: "not strictly ascending" };
      holidays[dn] = true;
      prev = dn;
    }
    var vt = parseIsoDate(cal.validThrough);
    if (!vt || dayNumber(vt) !== prev) return { ok: false, reason: "validThrough mismatch" };
    return { ok: true, reason: "", holidays: holidays, validThroughDay: prev, validThrough: vt };
  }

  function isBusinessDay(dn, holidays) {
    var wd = new Date(dn * MS_PER_DAY).getUTCDay();
    return WEEKEND_UTC_DAYS.indexOf(wd) === -1 && !holidays[dn];
  }

  // Port of business_calendar.business_days_between(start_dt, end_dt).
  function businessDaysBetween(start, end, holidays) {
    if (compareParts(end, start) < 0) return 0;
    var count = 0;
    for (var d = dayNumber(start) + 1, last = dayNumber(end); d <= last; d++) {
      if (isBusinessDay(d, holidays)) count++;
    }
    return count;
  }

  // Current wall-clock time in Israel as parts (independent of the viewer's time zone).
  function israelNowParts(date) {
    var f = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    var out = {};
    f.formatToParts(date || new Date()).forEach(function (x) { out[x.type] = x.value; });
    return { y: +out.year, m: +out.month, d: +out.day, H: +out.hour % 24, M: +out.minute, S: +out.second };
  }

  function formatDateTime(p) { return pad2(p.d) + "/" + pad2(p.m) + "/" + p.y + " " + pad2(p.H) + ":" + pad2(p.M); }
  function formatDate(p) { return pad2(p.d) + "/" + pad2(p.m) + "/" + p.y; }

  // One order -> what the screen AND the Excel export show (single computation).
  //   state: ok | absent | missing | invalid | future | noCalendar | calendarExpired
  //   days: number only when state === "ok"
  function statusAge(order, calInfo, now) {
    var st = order && order.statusUpdateState;
    var base = { state: st || "absent", days: null, dateText: "", daysText: TEXT.none, excelDate: null, flag: false };
    if (!st || st === "absent" || st === "missing") return base;
    var p = st === "ok" ? parseIsoDateTime(order.statusUpdate) : null;
    if (!p) {
      base.state = "invalid"; base.dateText = TEXT.invalidDate; base.flag = true;
      return base;
    }
    base.dateText = formatDateTime(p);
    base.excelDate = new Date(Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S)); // wall-clock value for Excel
    if (compareParts(p, now) > 0) {
      base.state = "future"; base.daysText = TEXT.future; base.flag = true;
      return base;
    }
    if (!calInfo || !calInfo.ok) {
      base.state = "noCalendar"; base.daysText = TEXT.noCalendar;
      return base;
    }
    if (dayNumber(now) > calInfo.validThroughDay) {
      base.state = "calendarExpired"; base.daysText = TEXT.calendarExpired;
      return base;
    }
    base.state = "ok";
    base.days = businessDaysBetween(p, now, calInfo.holidays);
    base.daysText = String(base.days);
    return base;
  }

  // Computes every order once (stored as order._statusAge) and returns a summary for the notes.
  function annotate(providers, meta, nowDate) {
    var calInfo = prepareCalendar(meta && meta.businessCalendar);
    var now = israelNowParts(nowDate);
    var counts = {};
    Object.keys(providers || {}).forEach(function (k) {
      ((providers[k] || {}).orders || []).forEach(function (o) {
        o._statusAge = statusAge(o, calInfo, now);
        counts[o._statusAge.state] = (counts[o._statusAge.state] || 0) + 1;
      });
    });
    return { calInfo: calInfo, now: now, counts: counts, columnPresent: !!(meta && meta.statusUpdateColumnPresent === true) };
  }

  // Note above each detail table -> {text, warning, parts:[{text, warning}]}
  //   warning (whole note): the calendar is missing/malformed/expired -> no numbers at all
  //   per-part warning: orders without a number (future / invalid / missing date)
  function noteFor(summary) {
    if (!summary) return { text: "ימי עבודה בסטטוס אינם זמינים.", warning: true, parts: [{ text: "ימי עבודה בסטטוס אינם זמינים.", warning: true }] };
    var parts = [], warning = false;
    if (!summary.columnPresent) {
      parts.push({ text: "העמודה \"ת.עדכון סטטוס\" אינה קיימת בקובץ המקור הנוכחי — ימי עבודה בסטטוס אינם זמינים.", warning: false });
    }
    if (!summary.calInfo.ok) {
      parts.push({ text: "לוח ימי העבודה חסר או פגום בנתונים — מספר ימי העבודה אינו מוצג.", warning: true });
      warning = true;
    } else if (dayNumber(summary.now) > summary.calInfo.validThroughDay) {
      parts.push({ text: "לוח ימי העבודה מוגדר עד " + formatDate(summary.calInfo.validThrough) +
        " בלבד — מספר ימי העבודה אינו מוצג עד לעדכון הלוח.", warning: true });
      warning = true;
    } else if (summary.columnPresent) {
      parts.push({ text: "ימי עבודה בסטטוס נכון ל־" + formatDateTime(summary.now) +
        " (שעון ישראל): ראשון–חמישי, ללא חגים וערבי חג; יום העדכון עצמו אינו נספר.", warning: false });
    }
    var c = summary.counts, extra = [];
    if (c.future) extra.push(c.future + " עם תאריך עדכון עתידי");
    if (c.invalid) extra.push(c.invalid + " עם תאריך לא תקין");
    if (c.missing) extra.push(c.missing + " ללא תאריך עדכון");
    if (extra.length) parts.push({ text: "הזמנות ללא חישוב: " + extra.join(", ") + ".", warning: true });
    return { text: parts.map(function (p) { return p.text; }).join(" "), warning: warning, parts: parts };
  }

  return {
    TEXT: TEXT,
    parseIsoDate: parseIsoDate,
    parseIsoDateTime: parseIsoDateTime,
    prepareCalendar: prepareCalendar,
    businessDaysBetween: businessDaysBetween,
    israelNowParts: israelNowParts,
    statusAge: statusAge,
    annotate: annotate,
    noteFor: noteFor,
  };
})();
