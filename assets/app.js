/* ทันส่ง — shared script: storage, task rendering, editor and page logic */
(function () {
  'use strict';

  var KEY = 'tansong.tasks.v1';
  var COLOR_KEY = 'tansong.colors.v1';
  var UNDO_KEY = 'tansong.undo';
  var TYPES = ['การบ้าน', 'รายงาน', 'โปรเจกต์', 'นำเสนอ', 'สอบ/ควิซ', 'อื่นๆ'];
  var PALETTE = ['#3D56D6', '#1E9E8F', '#9B4DCA', '#D99A00', '#D9467A', '#3C8A3E', '#2B8CC4', '#E5532D'];
  var DAY = 864e5;
  var page = document.body.getAttribute('data-page') || '';

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toLocal(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function parseDue(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return new Date(NaN);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dayDiff(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / DAY); }
  function byDue(a, b) { return parseDue(a.due) - parseDue(b.due); }
  function taskUrl(t) { return 'task.html?id=' + encodeURIComponent(t.id); }
  function safeUrl(u) {
    try {
      var x = new URL(u);
      return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '';
    } catch (e) { return ''; }
  }

  function svg(p) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  var I = {
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    chevron: svg('<path d="M9 6l6 6-6 6"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
    out: svg('<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/>')
  };

  var fmtShort = new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  var fmtLong = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function timeStr(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' น.'; }
  function dueShort(t, now) {
    var d = parseDue(t.due);
    if (isNaN(d)) return 'ไม่ระบุวันส่ง';
    var dd = dayDiff(d, now || new Date());
    var day = dd === 0 ? 'วันนี้' : dd === 1 ? 'พรุ่งนี้' : dd === -1 ? 'เมื่อวาน' : fmtShort.format(d);
    return day + ' ' + timeStr(d);
  }
  function dueLong(t) {
    var d = parseDue(t.due);
    return isNaN(d) ? 'ไม่ระบุวันส่ง' : fmtLong.format(d) + ' เวลา ' + timeStr(d);
  }

  function urgency(t, now) {
    if (t.submitted) return 'submitted';
    var due = parseDue(t.due);
    if (due < now) return 'overdue';
    var dd = dayDiff(due, now);
    if (dd === 0) return 'today';
    if (dd === 1) return 'tomorrow';
    if (dd <= 7) return 'week';
    return 'later';
  }
  function countdown(t, now) {
    if (t.submitted) return 'ส่งแล้ว';
    var ms = parseDue(t.due) - now;
    var a = Math.abs(ms), min = Math.floor(a / 6e4), h = Math.floor(min / 60), d = Math.floor(h / 24), s;
    if (d >= 1) s = d + ' วัน' + (d < 2 && h % 24 ? ' ' + (h % 24) + ' ชม.' : '');
    else if (h >= 1) s = h + ' ชม.' + (h < 3 && min % 60 ? ' ' + (min % 60) + ' นาที' : '');
    else s = Math.max(1, min) + ' นาที';
    return ms < 0 ? 'เลยกำหนด ' + s : 'อีก ' + s;
  }
  function prog(t) {
    var total = t.subtasks.length;
    var done = t.subtasks.filter(function (s) { return s.done; }).length;
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : (t.submitted ? 100 : 0) };
  }

  /* ---------- sample data ---------- */
  function seed() {
    var now = Date.now();
    function at(d, h, m) { var x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return toLocal(x); }
    function steps(list, doneCount) {
      return list.map(function (text, i) { return { id: 's' + (i + 1), text: text, done: i < doneCount }; });
    }
    function T(id, hoursAgo, o) {
      return Object.assign({ id: id, where: '', link: '', notes: '', subtasks: [], submitted: false, createdAt: now - hoursAgo * 36e5 }, o);
    }
    return [
      T('demo-calc-hw4', 50, {
        title: 'แบบฝึกหัดบทที่ 4 อนุพันธ์', subject: 'แคลคูลัส 1', type: 'การบ้าน', due: at(0, 23, 59),
        where: 'อัปโหลดไฟล์ PDF ในระบบเรียนออนไลน์ของวิชา',
        subtasks: steps(['ทำข้อ 1–10', 'ทำข้อ 11–20', 'สแกนรวมเป็น PDF ไฟล์เดียว', 'อัปโหลดแล้วเปิดเช็กว่าไฟล์อ่านได้'], 1),
        notes: 'ข้อ 15 กับ 18 ใช้กฎลูกโซ่ ดูตัวอย่างในสไลด์สัปดาห์ที่ 6'
      }),
      T('demo-eng-quiz6', 30, {
        title: 'ควิซการอ่าน Unit 6', subject: 'ภาษาอังกฤษเพื่อการสื่อสาร', type: 'สอบ/ควิซ', due: at(1, 9, 0),
        where: 'ทำในห้องช่วงต้นคาบ',
        subtasks: steps(['อ่านบทความ Unit 6 รอบแรก', 'จดคำศัพท์ใหม่พร้อมความหมาย', 'ทำแบบฝึกท้ายบท'], 0),
        notes: 'อาจารย์บอกท้ายคาบว่าเน้นการจับใจความหลัก'
      }),
      T('demo-econ-news', 120, {
        title: 'สรุปข่าวเศรษฐกิจ 1 หน้า', subject: 'เศรษฐศาสตร์จุลภาค', type: 'การบ้าน', due: at(-1, 16, 0),
        where: 'ส่งทางอีเมลอาจารย์',
        subtasks: steps(['เลือกข่าวที่เกี่ยวกับอุปสงค์และอุปทาน', 'อ่านแล้วจดประเด็นสำคัญ', 'เขียนสรุป 1 หน้า', 'ส่งอีเมลพร้อมระบุรหัสนักศึกษา'], 2),
        notes: 'ยังไม่ได้ส่ง ต้องถามอาจารย์ว่ารับงานส่งช้าหรือไม่'
      }),
      T('demo-prog-lab3', 72, {
        title: 'Lab 3: โปรแกรมคำนวณเกรด', subject: 'การเขียนโปรแกรมเบื้องต้น', type: 'การบ้าน', due: at(3, 18, 0),
        where: 'ส่งไฟล์ .py ในระบบเรียนออนไลน์',
        subtasks: steps(['อ่านโจทย์และตัวอย่างข้อมูลเข้า', 'เขียนฟังก์ชันแปลงคะแนนเป็นเกรด', 'ทดสอบคะแนนที่อยู่ตรงขอบ เช่น 79.5 และ 80', 'แคปภาพผลลัพธ์แนบท้ายไฟล์'], 2)
      }),
      T('demo-stat-report', 200, {
        title: 'รายงานกลุ่ม: การใช้จ่ายรายเดือนของนักศึกษา', subject: 'สถิติเบื้องต้น', type: 'รายงาน', due: at(5, 23, 59),
        where: 'ส่งไฟล์ PDF ในระบบเรียนออนไลน์ ส่งคนเดียวแทนทั้งกลุ่ม',
        subtasks: steps(['แบ่งหัวข้อกับเพื่อนในกลุ่ม', 'ทำแบบสอบถามออนไลน์', 'เก็บข้อมูลให้ครบ 30 คน', 'ทำตารางและกราฟสรุป', 'เขียนส่วนอภิปรายผล', 'ตรวจรูปแบบการอ้างอิงก่อนส่ง'], 2),
        notes: 'กลุ่ม 5 คน เรารับส่วนตารางและกราฟ\nนัดรวมไฟล์คืนก่อนวันส่ง'
      }),
      T('demo-writing-present', 96, {
        title: 'นำเสนอบทความวิชาการ 10 นาที', subject: 'การคิดและการเขียนเชิงวิชาการ', type: 'นำเสนอ', due: at(8, 13, 30),
        where: 'นำเสนอในห้อง ส่งไฟล์สไลด์ก่อนเริ่มคาบ',
        subtasks: steps(['เลือกบทความและส่งหัวข้อให้อาจารย์', 'สรุปประเด็นหลัก 3 ข้อ', 'ทำสไลด์ไม่เกิน 8 หน้า', 'ซ้อมพูดและจับเวลา'], 1)
      }),
      T('demo-econ-midterm', 150, {
        title: 'สอบกลางภาค', subject: 'เศรษฐศาสตร์จุลภาค', type: 'สอบ/ควิซ', due: at(12, 9, 0),
        where: 'ห้องสอบตามประกาศของคณะ',
        subtasks: steps(['ทบทวนบทที่ 1–3', 'ทบทวนบทที่ 4–5', 'ทำข้อสอบเก่า 1 ชุด', 'สรุปสูตรและกราฟสำคัญ 1 หน้า'], 0)
      }),
      T('demo-prog-project', 240, {
        title: 'โปรเจกต์ปลายภาค: ต้นแบบระบบจองห้องติว', subject: 'การเขียนโปรแกรมเบื้องต้น', type: 'โปรเจกต์', due: at(20, 23, 59),
        where: 'ส่งลิงก์โค้ดและวิดีโอสาธิตในระบบเรียนออนไลน์',
        subtasks: steps(['ส่งหัวข้อและรายชื่อสมาชิกกลุ่ม', 'ร่างหน้าจอคร่าวๆ', 'เขียนส่วนบันทึกการจอง', 'ให้เพื่อนลองใช้ 3 คน', 'อัดวิดีโอสาธิต 3 นาที'], 1)
      }),
      T('demo-stat-quiz3', 220, {
        title: 'ควิซบทที่ 3 ความน่าจะเป็น', subject: 'สถิติเบื้องต้น', type: 'สอบ/ควิซ', due: at(-3, 10, 0),
        where: 'ทำในระบบเรียนออนไลน์', submitted: true,
        subtasks: steps(['ทบทวนตัวอย่างในชีต', 'ทำแบบฝึกหัดท้ายบท'], 2)
      })
    ];
  }

  /* ---------- storage ---------- */
  var storageOk = true;
  function normalize(t) {
    if (!t || typeof t !== 'object') return null;
    return {
      id: String(t.id || uid()),
      title: String(t.title || 'งานไม่มีชื่อ'),
      subject: String(t.subject || 'ไม่ระบุวิชา'),
      type: TYPES.indexOf(t.type) > -1 ? t.type : 'อื่นๆ',
      due: String(t.due || toLocal(new Date())),
      where: String(t.where || ''),
      link: String(t.link || ''),
      notes: String(t.notes || ''),
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter(function (s) { return s && s.text; }).map(function (s) {
        return { id: String(s.id || uid()), text: String(s.text), done: !!s.done };
      }) : [],
      submitted: !!t.submitted,
      createdAt: +t.createdAt || Date.now()
    };
  }
  function read() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
    if (raw == null) { var s = seed(); persist(s); return s; }
    try {
      var a = JSON.parse(raw);
      if (Array.isArray(a)) return a.map(normalize).filter(Boolean);
    } catch (e) { /* fall through */ }
    return seed();
  }
  var warned = false;
  function persist(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) {
      storageOk = false;
      if (!warned) { warned = true; setTimeout(function () { toast('เบราว์เซอร์นี้ไม่ยอมให้บันทึกข้อมูล รายการจะหายเมื่อปิดหน้า'); }, 0); }
    }
  }
  var tasks = read();
  function getTask(id) { return tasks.filter(function (t) { return t.id === id; })[0] || null; }

  var colorMap = (function () {
    try { return JSON.parse(localStorage.getItem(COLOR_KEY)) || {}; } catch (e) { return {}; }
  })();
  function colorFor(subject) {
    var k = String(subject).trim();
    if (!colorMap[k]) {
      var used = Object.keys(colorMap).map(function (x) { return colorMap[x]; });
      var free = PALETTE.filter(function (c) { return used.indexOf(c) === -1; });
      var h = 0;
      for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
      colorMap[k] = free.length ? free[0] : PALETTE[h % PALETTE.length];
      try { localStorage.setItem(COLOR_KEY, JSON.stringify(colorMap)); } catch (e) { /* ignore */ }
    }
    return colorMap[k];
  }
  // assign colours in a stable order on first load
  tasks.slice().sort(function (a, b) { return a.createdAt - b.createdAt; }).forEach(function (t) { colorFor(t.subject); });

  function subjects() {
    var seen = {};
    tasks.forEach(function (t) { seen[t.subject] = true; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'th'); });
  }

  /* ---------- render plumbing ---------- */
  var render = function () {};
  var openSteps = {};
  var flashId = null;

  function rerender() {
    var a = document.activeElement;
    var key = a && a.getAttribute && a.getAttribute('data-fk');
    var kept = {};
    $$('input[data-fk]:not([type="checkbox"])').forEach(function (el) { kept[el.getAttribute('data-fk')] = el.value; });
    render();
    Object.keys(kept).forEach(function (k) {
      var el = $('[data-fk="' + k + '"]');
      if (el) el.value = kept[k];
    });
    if (key) {
      var el = $('[data-fk="' + key + '"]') || $('[data-fk^="' + key.split(':').slice(0, 2).join(':') + ':"]');
      if (el) el.focus({ preventScroll: true });
    }
  }
  function commit() {
    persist(tasks);
    hideToast();
    rerender();
  }
  function withUndo(msg, mutate, redirect) {
    var before = JSON.stringify(tasks);
    mutate();
    if (redirect) {
      persist(tasks);
      try { sessionStorage.setItem(UNDO_KEY, JSON.stringify({ msg: msg, before: before })); } catch (e) { /* ignore */ }
      location.href = redirect;
      return;
    }
    commit();
    offerUndo(msg, before);
  }
  function offerUndo(msg, before) {
    toast(msg, {
      label: 'ย้อนกลับ',
      fn: function () {
        tasks = JSON.parse(before).map(normalize).filter(Boolean);
        commit();
        toast('ย้อนกลับแล้ว');
      }
    });
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toastRegion() {
    var region = $('#toast-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toast-region';
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    return region;
  }
  function toast(msg, action) {
    var region = toastRegion();
    clearTimeout(toastTimer);
    region.innerHTML = '<div class="toast"><span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '') + '</div>';
    if (action) {
      region.querySelector('button').addEventListener('click', function () { hideToast(); action.fn(); });
    }
    toastTimer = setTimeout(hideToast, action ? 7000 : 3000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    var region = $('#toast-region');
    if (region) region.innerHTML = '';
  }

  /* ---------- search helpers ---------- */
  function termsOf(q) { return String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean); }
  function haystack(t) {
    return [t.title, t.subject, t.type, t.where, t.notes].concat(t.subtasks.map(function (s) { return s.text; })).join('\n').toLowerCase();
  }
  function matches(t, terms) {
    if (!terms.length) return true;
    var h = haystack(t);
    return terms.every(function (x) { return h.indexOf(x) > -1; });
  }
  function hl(text, terms) {
    text = String(text || '');
    if (!terms || !terms.length) return esc(text);
    var low = text.toLowerCase(), marks = [];
    terms.forEach(function (x) {
      var i = low.indexOf(x);
      while (i !== -1) { for (var k = i; k < i + x.length; k++) marks[k] = true; i = low.indexOf(x, i + x.length); }
    });
    var out = '', open = false;
    for (var i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }
  function hasTerm(text, terms) {
    var low = String(text || '').toLowerCase();
    return terms.some(function (x) { return low.indexOf(x) > -1; });
  }

  /* ---------- components ---------- */
  function subjTag(t, extra) {
    return '<span class="subj" style="--c:' + colorFor(t.subject) + '"><i></i><span>' + (extra || esc(t.subject)) + '</span></span>';
  }

  function taskCard(t, now, terms) {
    var u = urgency(t, now), p = prog(t), c = colorFor(t.subject);
    var open = !!openSteps[t.id] && p.total > 0;
    var H = function (s) { return hl(s, terms); };
    var id = esc(t.id);
    var note = '';
    if (terms && terms.length) {
      var hits = t.subtasks.filter(function (s) { return hasTerm(s.text, terms); }).slice(0, 2);
      if (hits.length && !open) note += '<p class="match-note">พบในขั้นตอน: ' + hits.map(function (s) { return H(s.text); }).join(' · ') + '</p>';
      if (hasTerm(t.notes, terms)) {
        var line = t.notes.split('\n').filter(function (l) { return hasTerm(l, terms); })[0];
        note += '<p class="match-note">พบในโน้ต: ' + H(line) + '</p>';
      }
    }
    var count = p.total
      ? (p.done === p.total && !t.submitted ? 'ครบ ' + p.total + ' ขั้น · รอส่ง' : p.done + '/' + p.total + ' ขั้น')
      : 'ยังไม่แบ่งขั้นตอน';

    return '<article class="task' + (t.submitted ? ' is-submitted' : '') + (flashId === t.id ? ' flash' : '') + '" style="--c:' + c + '">' +
      '<div class="task-top">' + subjTag(t, H(t.subject)) + '<span class="type">' + H(t.type) + '</span>' +
        '<span class="chip chip-' + u + '">' + esc(countdown(t, now)) + '</span></div>' +
      '<h3 class="task-title"><a href="' + taskUrl(t) + '">' + H(t.title) + '</a></h3>' +
      '<p class="task-meta">' + esc(dueShort(t, now)) + (t.where ? '<span class="sep">/</span>' + H(t.where) : '') + '</p>' +
      note +
      (p.total ? '<div class="task-prog"><div class="bar' + (p.pct === 100 ? ' is-full' : '') + '" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '"><span style="width:' + p.pct + '%"></span></div><span class="count">' + count + '</span></div>' : '') +
      (open ? '<ul class="task-steps" id="steps-' + id + '">' + t.subtasks.map(function (s) { return stepItem(t, s, H, 'step'); }).join('') + '</ul>' : '') +
      '<div class="task-foot">' +
        (p.total
          ? '<button type="button" class="steps-toggle" data-act="steps" data-id="' + id + '" data-fk="steps:' + id + '" aria-expanded="' + open + '"' + (open ? ' aria-controls="steps-' + id + '"' : '') + '>' + I.chevron + 'ขั้นตอนย่อย</button>'
          : '<button type="button" class="steps-toggle" data-act="split" data-id="' + id + '" data-fk="split:' + id + '">' + I.plus + 'แบ่งขั้นตอน</button>') +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost btn-sm btn-toggle" data-act="submit" data-id="' + id + '" data-fk="submit:' + id + '" aria-pressed="' + t.submitted + '">' + I.check + 'ส่งแล้ว</button>' +
        '<button type="button" class="icon-btn" data-act="edit" data-id="' + id + '" data-fk="edit:' + id + '" aria-label="แก้ไขงาน ' + esc(t.title) + '" title="แก้ไข">' + I.edit + '</button>' +
        '<button type="button" class="icon-btn" data-act="delete" data-id="' + id + '" data-fk="delete:' + id + '" aria-label="ลบงาน ' + esc(t.title) + '" title="ลบ">' + I.trash + '</button>' +
      '</div>' +
    '</article>';
  }

  function stepItem(t, s, H, prefix) {
    return '<li class="step-item' + (s.done ? ' is-done' : '') + '"><label><input type="checkbox" class="check" data-id="' + esc(t.id) + '" data-step="' + esc(s.id) + '" data-fk="' + prefix + ':' + esc(t.id) + ':' + esc(s.id) + '"' + (s.done ? ' checked' : '') + '><span>' + (H ? H(s.text) : esc(s.text)) + '</span></label></li>';
  }

  function miniTask(t, now) {
    return '<a class="mini-task" href="' + taskUrl(t) + '" style="--c:' + colorFor(t.subject) + '">' +
      '<strong>' + esc(t.title) + '</strong>' +
      subjTag(t, esc(t.subject) + ' · ' + esc(dueShort(t, now))) +
      '<span class="chip chip-' + urgency(t, now) + '">' + esc(countdown(t, now)) + '</span></a>';
  }

  function focusCard(now, inApp) {
    var open = tasks.filter(function (t) { return !t.submitted; }).sort(byDue);
    var label = '<p class="focus-label">' + I.target + 'ทำอันนี้ก่อน</p>';
    if (!tasks.length) {
      return '<section class="focus">' + label + '<h2>ยังไม่มีงานในรายการ</h2><p class="focus-meta">เพิ่มงานแรก แล้วทันส่งจะเลือกงานที่ควรเริ่มให้</p>' +
        (inApp ? '<button type="button" class="btn btn-sm btn-accent" data-act="add">' + I.plus + 'เพิ่มงาน</button>' : '<a class="btn btn-sm btn-accent" href="board.html#add">เพิ่มงาน</a>') + '</section>';
    }
    if (!open.length) {
      return '<section class="focus">' + label + '<h2>ส่งครบทุกงานแล้ว</h2><p class="focus-meta">ไม่มีงานค้างในรายการ เมื่อมีงานใหม่ให้เพิ่มเข้ามาได้เลย</p></section>';
    }
    var t = open[0], p = prog(t), id = esc(t.id);
    var next = t.subtasks.filter(function (s) { return !s.done; })[0];
    var body;
    if (next) {
      body = '<div class="focus-next"><small>ขั้นต่อไป · ติ๊กเมื่อทำเสร็จ</small>' +
        '<label><input type="checkbox" class="check" data-id="' + id + '" data-step="' + esc(next.id) + '" data-fk="focus:' + id + ':' + esc(next.id) + '"><span>' + esc(next.text) + '</span></label></div>';
    } else if (p.total) {
      body = '<div class="focus-next"><small>ทำครบทุกขั้นแล้ว เหลือส่งงาน</small>' +
        '<button type="button" class="btn btn-sm btn-accent" data-act="submit" data-id="' + id + '" data-fk="focus:' + id + ':submit">' + I.check + 'ส่งแล้ว</button></div>';
    } else {
      body = '<div class="focus-next"><small>งานนี้ยังไม่มีขั้นตอนย่อย</small>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-act="split" data-id="' + id + '" data-fk="focus:' + id + ':split">' + I.plus + 'แบ่งเป็นขั้นตอนย่อย</button></div>';
    }
    return '<section class="focus" style="--c:' + colorFor(t.subject) + '" aria-labelledby="focus-title">' + label +
      '<h2 id="focus-title"><a href="' + taskUrl(t) + '">' + esc(t.title) + '</a></h2>' +
      '<div class="focus-meta">' + subjTag(t) + '<span>' + esc(dueShort(t, now)) + '</span><span class="chip chip-' + urgency(t, now) + '">' + esc(countdown(t, now)) + '</span></div>' +
      body +
      (p.total ? '<div class="focus-prog"><div class="bar"><span style="width:' + p.pct + '%"></span></div><span>' + p.done + '/' + p.total + ' ขั้น</span></div>' : '') +
      '<p class="focus-why">เลือกจากงานที่ยังไม่ส่งและถึงกำหนดเร็วที่สุด</p></section>';
  }

  /* ---------- editor dialog ---------- */
  var editing = null;
  var afterSave = null;

  function ensureEditor() {
    if ($('#editor')) return $('#editor');
    var html =
      '<dialog class="sheet" id="editor" aria-labelledby="editor-title">' +
      '<form id="editor-form" novalidate>' +
        '<div class="sheet-head"><h2 id="editor-title">เพิ่มงาน</h2><button type="button" class="icon-btn" data-close aria-label="ปิด">' + I.x + '</button></div>' +
        '<div class="sheet-body">' +
          '<div class="field"><label for="f-title">ชื่องาน</label><input class="input" id="f-title" maxlength="120" autocomplete="off" placeholder="เช่น รายงานบทที่ 2, ควิซ Unit 5"></div>' +
          '<div class="field-row">' +
            '<div class="field"><label for="f-subject">วิชา</label><input class="input" id="f-subject" list="f-subject-list" maxlength="60" autocomplete="off" placeholder="เช่น สถิติเบื้องต้น"><datalist id="f-subject-list"></datalist></div>' +
            '<div class="field"><label for="f-type">ประเภท</label><select class="input" id="f-type">' + TYPES.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label for="f-date">วันส่ง</label><input class="input" type="date" id="f-date"></div>' +
            '<div class="field"><label for="f-time">เวลาส่ง</label><input class="input" type="time" id="f-time"></div>' +
          '</div>' +
          '<div class="field"><label for="f-where">ส่งที่ไหน <span class="opt">(ไม่บังคับ)</span></label><input class="input" id="f-where" maxlength="120" placeholder="เช่น ระบบเรียนออนไลน์, ส่งในห้อง, อีเมลอาจารย์"></div>' +
          '<fieldset class="field"><legend>ขั้นตอนย่อย <span class="opt">(ไม่บังคับ)</span></legend>' +
            '<ul class="edit-steps" id="f-steps"></ul>' +
            '<div class="add-step"><input class="input" id="f-newstep" maxlength="140" placeholder="พิมพ์ขั้นตอนแล้วกด Enter" aria-label="ขั้นตอนใหม่"><button type="button" class="btn btn-ghost btn-sm" id="f-add-step">เพิ่ม</button></div>' +
          '</fieldset>' +
          '<div class="field"><label for="f-link">ลิงก์ <span class="opt">(ไม่บังคับ)</span></label><input class="input" type="url" id="f-link" inputmode="url" autocomplete="off" placeholder="ลิงก์โจทย์หรือหน้าส่งงาน"></div>' +
          '<div class="field"><label for="f-notes">โน้ต <span class="opt">(ไม่บังคับ)</span></label><textarea class="input" id="f-notes" rows="3" maxlength="1000" placeholder="เช่น เงื่อนไขที่อาจารย์บอก หรือส่วนที่เรารับผิดชอบในงานกลุ่ม"></textarea></div>' +
        '</div>' +
        '<div class="sheet-foot"><p class="form-error" id="f-error" role="alert" hidden></p><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-ink">บันทึก</button></div>' +
      '</form></dialog>';
    document.body.insertAdjacentHTML('beforeend', html);
    var dlg = $('#editor');
    dlg.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeEditor();
      var rm = e.target.closest('[data-rm]');
      if (rm) { rm.closest('li').remove(); $('#f-newstep').focus(); }
    });
    $('#f-add-step').addEventListener('click', addEditorStep);
    $('#f-newstep').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addEditorStep(); }
    });
    $('#f-steps').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing && e.target.matches('input')) { e.preventDefault(); $('#f-newstep').focus(); }
    });
    $('#editor-form').addEventListener('submit', saveEditor);
    return dlg;
  }

  function editorStepRow(s) {
    return '<li data-sid="' + esc(s.id) + '" data-done="' + (s.done ? 1 : 0) + '">' +
      '<span class="done-mark' + (s.done ? ' is-done' : '') + '" title="' + (s.done ? 'ทำแล้ว' : 'ยังไม่ได้ทำ') + '"></span>' +
      '<input class="input" value="' + esc(s.text) + '" maxlength="140" aria-label="ขั้นตอน">' +
      '<button type="button" class="icon-btn" data-rm aria-label="ลบขั้นตอนนี้">' + I.x + '</button></li>';
  }
  function addEditorStep() {
    var inp = $('#f-newstep'), v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    $('#f-steps').insertAdjacentHTML('beforeend', editorStepRow({ id: uid(), text: v, done: false }));
    inp.value = '';
    inp.focus();
  }

  function openEditor(t, opts) {
    opts = opts || {};
    var dlg = ensureEditor();
    if (dlg.open) return;
    editing = t ? t.id : null;
    afterSave = opts.afterSave || null;
    $('#editor-title').textContent = t ? 'แก้ไขงาน' : 'เพิ่มงาน';
    var parts = t ? t.due.split('T') : ['', '23:59'];
    $('#f-title').value = t ? t.title : '';
    $('#f-subject').value = t ? t.subject : (opts.subject || '');
    $('#f-type').value = t ? t.type : 'การบ้าน';
    $('#f-date').value = parts[0];
    $('#f-time').value = parts[1] || '23:59';
    $('#f-where').value = t ? t.where : '';
    $('#f-link').value = t ? t.link : '';
    $('#f-notes').value = t ? t.notes : '';
    $('#f-newstep').value = '';
    $('#f-steps').innerHTML = t ? t.subtasks.map(editorStepRow).join('') : '';
    $('#f-subject-list').innerHTML = subjects().map(function (s) { return '<option value="' + esc(s) + '"></option>'; }).join('');
    $$('#editor [aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    $('#f-error').hidden = true;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('.sheet-body', dlg).scrollTop = 0;
    (opts.focusSteps ? $('#f-newstep') : $('#f-title')).focus();
  }
  function closeEditor() {
    var dlg = $('#editor');
    if (!dlg) return;
    if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
  }

  function saveEditor(e) {
    e.preventDefault();
    var f = {
      title: $('#f-title'), subject: $('#f-subject'), date: $('#f-date'), time: $('#f-time'), link: $('#f-link')
    };
    var missing = [];
    [['title', 'ชื่องาน'], ['subject', 'วิชา'], ['date', 'วันส่ง'], ['time', 'เวลาส่ง']].forEach(function (x) {
      var bad = !f[x[0]].value.trim();
      if (bad) { f[x[0]].setAttribute('aria-invalid', 'true'); missing.push(x[1]); }
      else f[x[0]].removeAttribute('aria-invalid');
    });
    var link = f.link.value.trim();
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    var linkBad = link && !safeUrl(link);
    if (linkBad) f.link.setAttribute('aria-invalid', 'true'); else f.link.removeAttribute('aria-invalid');

    var err = $('#f-error');
    if (missing.length || linkBad) {
      err.textContent = missing.length ? 'ยังไม่ได้กรอก' + missing.join(' ') : 'ลิงก์ไม่ถูกต้อง';
      err.hidden = false;
      $('#editor [aria-invalid="true"]').focus();
      return;
    }
    err.hidden = true;

    var steps = $$('#f-steps li').map(function (li) {
      return { id: li.getAttribute('data-sid'), text: $('input', li).value.trim(), done: li.getAttribute('data-done') === '1' };
    }).filter(function (s) { return s.text; });
    var pending = $('#f-newstep').value.trim();
    if (pending) steps.push({ id: uid(), text: pending, done: false });

    var data = {
      title: f.title.value.trim(),
      subject: f.subject.value.trim(),
      type: $('#f-type').value,
      due: f.date.value + 'T' + f.time.value.slice(0, 5),
      where: $('#f-where').value.trim(),
      link: link ? safeUrl(link) : '',
      notes: $('#f-notes').value.trim(),
      subtasks: steps
    };
    var isNew = !editing;
    var saved;
    if (isNew) {
      saved = normalize(Object.assign({ id: uid(), submitted: false, createdAt: Date.now() }, data));
      tasks.push(saved);
      flashId = saved.id;
    } else {
      saved = getTask(editing);
      if (!saved) { closeEditor(); return; }
      Object.assign(saved, data);
    }
    colorFor(saved.subject);
    var cb = afterSave;
    closeEditor();
    if (cb) cb(saved, isNew);
    commit();
    toast(isNew ? 'เพิ่ม “' + saved.title + '” แล้ว' : 'บันทึกการแก้ไขแล้ว');
    flashId = null;
  }

  /* ---------- shared actions ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var t = b.getAttribute('data-id') ? getTask(b.getAttribute('data-id')) : null;
    var act = b.getAttribute('data-act');
    if (act === 'add') { openEditor(null, { afterSave: hooks.afterAdd, subject: hooks.subject && hooks.subject() }); return; }
    if (act === 'reset-sample') {
      withUndo('โหลดข้อมูลตัวอย่างใหม่แล้ว', function () { tasks = seed(); });
      return;
    }
    if (act === 'clear-all') {
      var n = tasks.length;
      if (!n) return;
      withUndo('ลบงานทั้งหมด ' + n + ' งานแล้ว', function () { tasks = []; });
      return;
    }
    if (!t) return;
    if (act === 'edit') openEditor(t);
    else if (act === 'split') openEditor(t, { focusSteps: true });
    else if (act === 'steps') { openSteps[t.id] = !openSteps[t.id]; rerender(); }
    else if (act === 'submit') {
      var willSubmit = !t.submitted;
      withUndo(willSubmit ? 'บันทึกว่า “' + t.title + '” ส่งแล้ว' : 'ย้าย “' + t.title + '” กลับไปที่ยังไม่ส่ง', function () { t.submitted = willSubmit; });
    }
    else if (act === 'delete') {
      withUndo('ลบ “' + t.title + '” แล้ว', function () {
        tasks = tasks.filter(function (x) { return x.id !== t.id; });
      }, page === 'task' ? 'board.html' : null);
    }
    else if (act === 'del-step') {
      var sid = b.getAttribute('data-sid');
      var s = t.subtasks.filter(function (x) { return x.id === sid; })[0];
      if (!s) return;
      withUndo('ลบขั้นตอน “' + s.text + '” แล้ว', function () {
        t.subtasks = t.subtasks.filter(function (x) { return x.id !== sid; });
      });
    }
  });

  document.addEventListener('change', function (e) {
    var c = e.target;
    if (!c.matches || !c.matches('input.check[data-step]')) return;
    var t = getTask(c.getAttribute('data-id'));
    var s = t && t.subtasks.filter(function (x) { return x.id === c.getAttribute('data-step'); })[0];
    if (!s) return;
    s.done = c.checked;
    commit();
    if (s.done && !t.submitted && t.subtasks.every(function (x) { return x.done; })) {
      toast('ทำครบทุกขั้นของ “' + t.title + '” แล้ว ส่งงานเสร็จอย่าลืมกด “ส่งแล้ว”');
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    var id = form.getAttribute && form.getAttribute('data-add-step');
    if (!id) return;
    e.preventDefault();
    var t = getTask(id), inp = $('input', form), v = inp.value.trim();
    if (!t || !v) { inp.focus(); return; }
    t.subtasks.push({ id: uid(), text: v, done: false });
    inp.value = '';
    commit();
  });

  var hooks = {};

  /* ---------- pages ---------- */
  function initHome() {
    var slot = $('#hero-demo');
    if (!slot) return;
    render = function () {
      var now = new Date();
      var open = tasks.filter(function (t) { return !t.submitted; }).sort(byDue);
      var rest = open.slice(1, 4);
      slot.innerHTML = '<p class="hero-demo-label">งานของคุณตอนนี้ · ติ๊กขั้นตอนได้เลย</p>' +
        focusCard(now, false) +
        (rest.length ? '<ul class="upcoming" aria-label="งานถัดไป">' + rest.map(function (t) { return '<li>' + miniTask(t, now) + '</li>'; }).join('') + '</ul>' : '') +
        (open.length ? '<p class="hero-demo-foot"><a href="board.html">ดูงานทั้งหมด ' + open.length + ' งาน →</a></p>' : '');
    };
    render();
  }

  function initBoard() {
    var params = new URLSearchParams(location.search);
    var state = { status: 'open', subject: params.get('subject') || '', q: params.get('q') || '', sort: 'due' };
    var qInput = $('#board-q'), sortSel = $('#board-sort');
    qInput.value = state.q;

    qInput.addEventListener('input', function () { state.q = qInput.value; render(); });
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    $('#board-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-status]');
      if (b) { state.status = b.getAttribute('data-status'); render(); }
    });
    $('#board-subjects').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-subject]');
      if (b) { state.subject = b.getAttribute('data-subject'); render(); }
    });
    $('#board-list').addEventListener('click', function (e) {
      if (e.target.closest('[data-clear-filters]')) {
        state.q = ''; qInput.value = ''; state.subject = ''; state.status = 'open';
        render();
      }
    });

    hooks.subject = function () { return state.subject; };
    hooks.afterAdd = function (t, isNew) {
      if (!isNew) return;
      if (state.status === 'submitted') state.status = 'open';
      if (state.subject && state.subject !== t.subject) state.subject = '';
      if (state.q && !matches(t, termsOf(state.q))) { state.q = ''; qInput.value = ''; }
    };

    var GROUPS = [
      ['overdue', 'เลยกำหนด'], ['today', 'ส่งวันนี้'], ['tomorrow', 'ส่งพรุ่งนี้'],
      ['week', 'ภายใน 7 วัน'], ['later', 'หลังจากนั้น'], ['submitted', 'ส่งแล้ว']
    ];

    /* side tiles: small read-only summaries of `tasks` */
    var BUCKETS = [['overdue', 'เลยกำหนด'], ['soon', 'วันนี้–พรุ่งนี้'], ['week', 'ภายใน 7 วัน'], ['later', 'หลังจากนั้น'], ['submitted', 'ส่งแล้ว']];
    function summary(now, open) {
      var cnt = { overdue: 0, soon: 0, week: 0, later: 0, submitted: 0 };
      tasks.forEach(function (t) { var u = urgency(t, now); cnt[u === 'today' || u === 'tomorrow' ? 'soon' : u]++; });
      $('#stats').innerHTML = BUCKETS.map(function (b) {
        var n = cnt[b[0]];
        return '<div class="stat stat-' + b[0] + (n ? '' : ' is-zero') + (b[0] === 'overdue' && n ? ' is-alert' : '') + '"><span>' + b[1] + '</span><b>' + n + '</b></div>';
      }).join('');

      var bySub = {}, done = 0, total = 0;
      open.forEach(function (t) {
        var p = prog(t), s = bySub[t.subject] = bySub[t.subject] || { name: t.subject, done: 0, total: 0 };
        s.done += p.done; s.total += p.total; done += p.done; total += p.total;
      });
      var subs = Object.keys(bySub).map(function (k) { return bySub[k]; }).filter(function (s) { return s.total; });
      $('#progress-summary').innerHTML = subs.length
        ? '<div class="big-figure"><b>' + Math.round(done / total * 100) + '<small>%</small></b><span>ทำไปแล้ว ' + done + ' จาก ' + total + ' ขั้น ในงานที่ยังไม่ส่ง</span></div>' +
          '<ul class="subj-bars">' + subs.sort(function (a, b) { return (b.total - b.done) - (a.total - a.done); }).map(function (s) {
            var pct = Math.round(s.done / s.total * 100);
            return '<li style="--c:' + colorFor(s.name) + '"><div class="sb-top"><span>' + esc(s.name) + '</span><b>' + s.done + '/' + s.total + '</b></div>' +
              '<div class="bar" role="progressbar" aria-label="ความคืบหน้า ' + esc(s.name) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div></li>';
          }).join('') + '</ul>'
        : '<p class="tile-empty">' + (open.length ? 'งานที่ค้างยังไม่มีขั้นตอนย่อย' : 'ไม่มีงานค้าง') + '</p>';
    }

    render = function () {
      var now = new Date();
      $('#focus-slot').innerHTML = focusCard(now, true);

      var open = tasks.filter(function (t) { return !t.submitted; });
      summary(now, open);

      var subs = subjects();
      if (state.subject && subs.indexOf(state.subject) === -1) state.subject = '';
      $('#board-subjects').innerHTML = (subs.length > 1 ? '<button type="button" data-subject="" aria-pressed="' + !state.subject + '">ทุกวิชา</button>' +
        subs.map(function (s) {
          return '<button type="button" data-subject="' + esc(s) + '" style="--c:' + colorFor(s) + '" aria-pressed="' + (state.subject === s) + '"><i></i>' + esc(s) + '</button>';
        }).join('') : '');

      var submittedCount = tasks.length - open.length;
      $$('#board-seg button').forEach(function (b) {
        var st = b.getAttribute('data-status');
        b.setAttribute('aria-pressed', String(st === state.status));
        var n = st === 'open' ? open.length : st === 'submitted' ? submittedCount : tasks.length;
        $('.n', b).textContent = n;
      });

      var terms = termsOf(state.q);
      var list = tasks.filter(function (t) {
        if (state.status === 'open' && t.submitted) return false;
        if (state.status === 'submitted' && !t.submitted) return false;
        if (state.subject && t.subject !== state.subject) return false;
        return matches(t, terms);
      });

      var el = $('#board-list');
      if (!tasks.length) {
        el.innerHTML = '<div class="empty"><h2>ยังไม่มีงานในรายการ</h2><p>เพิ่มงานแรกจากสิ่งที่ต้องส่งเร็วที่สุดก่อน</p>' +
          '<div class="btn-row" style="justify-content:center"><button type="button" class="btn btn-accent" data-act="add">' + I.plus + 'เพิ่มงาน</button>' +
          '<button type="button" class="btn btn-ghost" data-act="reset-sample">โหลดงานตัวอย่าง</button></div></div>';
        return;
      }
      if (!list.length) {
        var allDone = state.status === 'open' && !open.length && !state.subject && !terms.length;
        el.innerHTML = allDone
          ? '<div class="empty"><h2>ส่งครบทุกงานแล้ว</h2><p>งานที่ส่งแล้วยังดูได้ในแท็บ “ส่งแล้ว”</p></div>'
          : '<div class="empty"><h2>ไม่พบงานที่ตรงกับตัวกรอง</h2><p>ลองเปลี่ยนคำค้น วิชา หรือสถานะ</p><button type="button" class="btn btn-ghost" data-clear-filters>ล้างตัวกรอง</button></div>';
        return;
      }

      var card = function (t) { return '<li>' + taskCard(t, now, terms) + '</li>'; };
      if (state.sort === 'due') {
        var buckets = {};
        list.forEach(function (t) { var u = urgency(t, now); (buckets[u] = buckets[u] || []).push(t); });
        el.innerHTML = GROUPS.filter(function (g) { return buckets[g[0]]; }).map(function (g) {
          var items = buckets[g[0]].sort(byDue);
          if (g[0] === 'submitted') items.reverse();
          return '<section class="group"><h2 class="group-head' + (g[0] === 'overdue' ? ' is-overdue' : '') + '">' + g[1] + ' <span class="n">' + items.length + '</span></h2>' +
            '<ul class="group-list">' + items.map(card).join('') + '</ul></section>';
        }).join('');
      } else {
        var sorted = list.slice();
        if (state.sort === 'due-desc') sorted.sort(function (a, b) { return byDue(b, a); });
        else if (state.sort === 'progress') sorted.sort(function (a, b) { return (prog(a).pct - prog(b).pct) || byDue(a, b); });
        else if (state.sort === 'recent') sorted.sort(function (a, b) { return b.createdAt - a.createdAt; });
        el.innerHTML = '<ul class="group-list">' + sorted.map(card).join('') + '</ul>';
      }
    };
    render();

    var undo = null;
    try { undo = JSON.parse(sessionStorage.getItem(UNDO_KEY)); sessionStorage.removeItem(UNDO_KEY); } catch (e) { /* ignore */ }
    if (undo && undo.before) offerUndo(undo.msg, undo.before);
    if (location.hash === '#add') {
      history.replaceState(null, '', location.pathname + location.search);
      openEditor(null, { afterSave: hooks.afterAdd });
    }
  }

  function initSearch() {
    var params = new URLSearchParams(location.search);
    var form = $('#search-form'), q = $('#sq'), fSub = $('#sf-subject'), fType = $('#sf-type'), fStatus = $('#sf-status'), fRange = $('#sf-range');
    fSub.innerHTML = '<option value="">ทุกวิชา</option>' + subjects().map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
    fType.innerHTML = '<option value="">ทุกประเภท</option>' + TYPES.map(function (x) { return '<option>' + x + '</option>'; }).join('');
    q.value = params.get('q') || '';
    fSub.value = params.get('subject') || '';
    fType.value = params.get('type') || '';
    fStatus.value = params.get('status') || 'all';
    fRange.value = params.get('range') || 'any';
    if (fSub.selectedIndex < 0) fSub.value = '';
    if (fType.selectedIndex < 0) fType.value = '';

    var suggest = ['สอบ', 'กลุ่ม', 'PDF'].concat(subjects().slice(0, 3));
    $('#suggest').innerHTML = '<span>ลองค้น:</span>' + suggest.map(function (s) { return '<button type="button" data-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join('');
    $('#suggest').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]');
      if (b) { q.value = b.getAttribute('data-q'); render(); q.focus(); }
    });

    function syncUrl() {
      var p = new URLSearchParams();
      if (q.value.trim()) p.set('q', q.value.trim());
      if (fSub.value) p.set('subject', fSub.value);
      if (fType.value) p.set('type', fType.value);
      if (fStatus.value !== 'all') p.set('status', fStatus.value);
      if (fRange.value !== 'any') p.set('range', fRange.value);
      var s = p.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
    }

    var timer;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(render, 120); });
    [fSub, fType, fStatus, fRange].forEach(function (el) { el.addEventListener('change', render); });
    form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
    $('#search-reset').addEventListener('click', function () {
      q.value = ''; fSub.value = ''; fType.value = ''; fStatus.value = 'all'; fRange.value = 'any';
      render(); q.focus();
    });

    render = function () {
      var now = new Date(), terms = termsOf(q.value);
      var list = tasks.filter(function (t) {
        if (fSub.value && t.subject !== fSub.value) return false;
        if (fType.value && t.type !== fType.value) return false;
        var due = parseDue(t.due), dd = dayDiff(due, now);
        if (fStatus.value === 'open' && t.submitted) return false;
        if (fStatus.value === 'submitted' && !t.submitted) return false;
        if (fStatus.value === 'overdue' && (t.submitted || due >= now)) return false;
        if (fRange.value === 'today' && dd !== 0) return false;
        if (fRange.value === '7' && (dd < 0 || dd > 7)) return false;
        if (fRange.value === '30' && (dd < 0 || dd > 30)) return false;
        return matches(t, terms);
      }).sort(function (a, b) { return (a.submitted - b.submitted) || byDue(a, b); });

      var filtered = terms.length || fSub.value || fType.value || fStatus.value !== 'all' || fRange.value !== 'any';
      $('#result-count').textContent = filtered ? 'พบ ' + list.length + ' งาน' : 'งานทั้งหมด ' + list.length + ' งาน';
      $('#search-reset').hidden = !filtered;
      $('#results').innerHTML = list.length
        ? list.map(function (t) { return '<li>' + taskCard(t, now, terms) + '</li>'; }).join('')
        : '<li class="empty"><h2>ไม่พบงานที่ตรงกับคำค้น</h2><p>ลองใช้คำที่สั้นลง เช่น ชื่อวิชาหรือคำหลักในชื่องาน</p></li>';
      syncUrl();
    };
    render();
  }

  function initTask() {
    var slot = $('#detail');
    var id = new URLSearchParams(location.search).get('id');
    render = function () {
      var t = getTask(id) || (id === 'demo-stat-report' || !id ? tasks.filter(function (x) { return !x.submitted; }).sort(byDue)[0] || tasks[0] : null), now = new Date();
      if (!t) {
        document.title = 'ไม่พบงาน — ทันส่ง';
        slot.innerHTML = '<div class="empty" style="margin-top:20px"><h1 style="font-size:28px">ไม่พบงานนี้</h1><p>งานอาจถูกลบไปแล้ว หรือเปิดจากเบราว์เซอร์อื่นที่ไม่มีรายการนี้</p>' +
          '<a class="btn btn-ink" href="board.html">ไปที่งานของฉัน</a></div>';
        return;
      }
      document.title = t.title + ' — ทันส่ง';
      var p = prog(t), u = urgency(t, now), tid = esc(t.id), link = safeUrl(t.link);
      var others = tasks.filter(function (x) { return x.subject === t.subject && x.id !== t.id && !x.submitted; }).sort(byDue);
      var stepsLabel = p.total ? (p.done === p.total ? 'ทำครบทุกขั้นแล้ว' : 'ทำแล้ว ' + p.done + ' จาก ' + p.total + ' ขั้น') : 'ยังไม่มีขั้นตอนย่อย';

      slot.innerHTML =
        '<a class="back-link" href="board.html">' + I.back + 'งานของฉัน</a>' +
        '<header class="detail-head" style="--c:' + colorFor(t.subject) + '">' +
          '<div class="top">' + subjTag(t) + '<span class="tag">' + esc(t.type) + '</span></div>' +
          '<h1>' + esc(t.title) + '</h1>' +
          '<p class="detail-due">' + esc(dueLong(t)) + '<span class="chip chip-' + u + '">' + esc(countdown(t, now)) + '</span></p>' +
        '</header>' +
        '<div class="detail-grid">' +
          '<section class="card" aria-labelledby="steps-title">' +
            '<h2 id="steps-title">ขั้นตอนย่อย</h2>' +
            '<div class="big-prog"><div class="bar' + (p.pct === 100 && p.total ? ' is-full' : '') + '" style="--c:' + colorFor(t.subject) + '" role="progressbar" aria-label="ความคืบหน้า" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '"><span style="width:' + (p.total ? p.pct : 0) + '%"></span></div><b>' + (p.total ? p.pct + '%' : '–') + '</b></div>' +
            '<p class="muted" style="font-size:15px;margin-top:-8px">' + stepsLabel + '</p>' +
            (p.total ? '<ul class="detail-steps">' + t.subtasks.map(function (s) {
              return stepItem(t, s, null, 'dstep').replace('</li>',
                '<button type="button" class="icon-btn" data-act="del-step" data-id="' + tid + '" data-sid="' + esc(s.id) + '" data-fk="delstep:' + tid + ':' + esc(s.id) + '" aria-label="ลบขั้นตอน ' + esc(s.text) + '" title="ลบขั้นตอน">' + I.x + '</button></li>');
            }).join('') + '</ul>' : '') +
            '<form class="add-step" data-add-step="' + tid + '"><input class="input" data-fk="newstep:' + tid + '" maxlength="140" placeholder="เพิ่มขั้นตอน เช่น อ่านโจทย์ให้ครบ" aria-label="ขั้นตอนใหม่"><button type="submit" class="btn btn-ink btn-sm" data-fk="addstep:' + tid + '">เพิ่ม</button></form>' +
          '</section>' +
          '<aside class="card">' +
            '<dl class="info-list">' +
              '<div><dt>ส่งที่ไหน</dt><dd>' + (t.where ? esc(t.where) : '<span class="faint">ยังไม่ได้ระบุ</span>') + '</dd></div>' +
              (link ? '<div><dt>ลิงก์</dt><dd><a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(link.replace(/^https?:\/\//, '').slice(0, 60)) + '</a></dd></div>' : '') +
              '<div><dt>โน้ต</dt><dd class="notes">' + (t.notes ? esc(t.notes) : '<span class="faint">ไม่มีโน้ต</span>') + '</dd></div>' +
              '<div><dt>สถานะ</dt><dd>' + (t.submitted ? 'ส่งแล้ว' : p.total && p.done === p.total ? 'ทำครบแล้ว รอส่ง' : p.done ? 'กำลังทำ' : 'ยังไม่เริ่ม') + '</dd></div>' +
            '</dl>' +
            '<div class="detail-actions">' +
              '<button type="button" class="btn ' + (t.submitted ? 'btn-ghost' : 'btn-accent') + '" data-act="submit" data-id="' + tid + '" data-fk="dsubmit:' + tid + '">' + (t.submitted ? 'ย้ายกลับไปที่ยังไม่ส่ง' : I.check + 'ส่งงานนี้แล้ว') + '</button>' +
              '<div class="row"><button type="button" class="btn btn-ghost" data-act="edit" data-id="' + tid + '" data-fk="dedit:' + tid + '">' + I.edit + 'แก้ไข</button>' +
              '<button type="button" class="btn btn-ghost" data-act="delete" data-id="' + tid + '">' + I.trash + 'ลบ</button></div>' +
            '</div>' +
          '</aside>' +
        '</div>' +
        '<section class="related"><h2 style="font-size:22px">งานอื่นที่ยังไม่ส่งในวิชา' + esc(t.subject) + '</h2>' +
          (others.length ? '<ul>' + others.map(function (x) { return '<li>' + miniTask(x, now) + '</li>'; }).join('') + '</ul>' : '<p class="muted">ไม่มีงานค้างอื่นในวิชานี้</p>') +
          '<p><a href="board.html?subject=' + encodeURIComponent(t.subject) + '">ดูงานทั้งหมดของวิชานี้</a></p>' +
        '</section>';
    };
    render();
  }

  /* ---------- global ---------- */
  var header = $('.site-header'), toggle = $('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('is-open')) {
        header.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  var init = { home: initHome, board: initBoard, search: initSearch, task: initTask }[page];
  if (init) {
    toastRegion();
    init();
    setInterval(function () { if (!document.hidden && !($('#editor') && $('#editor').open)) rerender(); }, 60000);
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) { tasks = read(); rerender(); }
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) { tasks = read(); rerender(); }
    });
  }
})();
